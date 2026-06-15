import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../notesApi', () => ({
  fetchNotes: vi.fn(),
  saveNotes: vi.fn(),
}))

import { NotesPanel } from '../NotesPanel'
import { useNotesStore } from '../notesStore'
import { fetchNotes, saveNotes } from '../notesApi'

const mockFetch = vi.mocked(fetchNotes)
const mockSave = vi.mocked(saveNotes)

describe('NotesPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useNotesStore.setState({ content: '' })
    mockFetch.mockResolvedValue('')
    mockSave.mockResolvedValue()
  })

  it('hydrates from the backend on mount', async () => {
    mockFetch.mockResolvedValue('- [ ] from backend')

    render(<NotesPanel onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('- [ ] from backend')
    })
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('typing does NOT call saveNotes (manual save only)', async () => {
    render(<NotesPanel onClose={() => {}} />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    await userEvent.type(screen.getByRole('textbox'), 'hello')

    expect(mockSave).not.toHaveBeenCalled()
  })

  it('Save button persists the draft and commits it to the store', async () => {
    render(<NotesPanel onClose={() => {}} />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    await userEvent.type(screen.getByRole('textbox'), 'persist me')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith('persist me')
    })
    expect(useNotesStore.getState().content).toBe('persist me')
  })

  it('Save button is disabled when there are no unsaved changes', async () => {
    useNotesStore.setState({ content: 'same' })
    mockFetch.mockResolvedValue('same')

    render(<NotesPanel onClose={() => {}} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('same'))

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('maximize button toggles the panel size', async () => {
    render(<NotesPanel onClose={() => {}} />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    const maximize = screen.getByRole('button', { name: /maximize/i })
    const panel = screen.getByTestId('notes-panel')

    expect(panel.className).toContain('w-96')
    await userEvent.click(maximize)
    expect(panel.className).not.toContain('w-96')
    expect(panel.className).toContain('w-[90vw]')
  })

  it('closing with unsaved changes asks for confirmation', async () => {
    const onClose = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<NotesPanel onClose={onClose} />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())

    await userEvent.type(screen.getByRole('textbox'), 'unsaved')
    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })
})

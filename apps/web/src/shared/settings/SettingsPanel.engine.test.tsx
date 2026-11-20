import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SettingsPanel from './SettingsPanel'
import { useSettingsStore } from './settingsStore'

describe('SettingsPanel — Engine section', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset()
  })

  it('chooses the Lichess cloud as the engine source (S1)', () => {
    render(<SettingsPanel onClose={vi.fn()} />)
    expect(useSettingsStore.getState().engineSource).toBe('local')
    fireEvent.change(screen.getByLabelText('Engine source'), { target: { value: 'lichess-cloud' } })
    expect(useSettingsStore.getState().engineSource).toBe('lichess-cloud')
  })

  it('sets the commentary database (private GitHub repository and token) and whether to borrow its remarks (S6)', () => {
    render(<SettingsPanel onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Commentary database URL'), { target: { value: 'https://api.github.com/repos/me/comments/contents' } })
    fireEvent.change(screen.getByLabelText('Commentary database token'), { target: { value: 'ghp_x' } })
    fireEvent.click(screen.getByRole('button', { name: /book remarks on the same position/i }))
    expect(useSettingsStore.getState()).toMatchObject({ commentDbUrl: 'https://api.github.com/repos/me/comments/contents', commentDbToken: 'ghp_x', humanComments: false })
  })

  it('chooses how books are read: main line only or with variations (S2)', () => {
    render(<SettingsPanel onClose={vi.fn()} />)
    const select = screen.getByLabelText('Recognition') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['2', '1'])
    fireEvent.change(select, { target: { value: '1' } })
    expect(useSettingsStore.getState().recognitionAlgorithm).toBe(1)
  })

  it('toggles Show evaluation', () => {
    render(<SettingsPanel onClose={vi.fn()} />)
    expect(useSettingsStore.getState().showEval).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /show evaluation/i }))
    expect(useSettingsStore.getState().showEval).toBe(false)
  })

  it('increments and decrements engine depth within bounds', () => {
    render(<SettingsPanel onClose={vi.fn()} />)
    expect(useSettingsStore.getState().engineDepth).toBe(30)
    fireEvent.click(screen.getByRole('button', { name: 'Increase depth' }))
    expect(useSettingsStore.getState().engineDepth).toBe(31)
    fireEvent.click(screen.getByRole('button', { name: 'Decrease depth' }))
    expect(useSettingsStore.getState().engineDepth).toBe(30)
  })

  it('clamps variations between 1 and 3', () => {
    render(<SettingsPanel onClose={vi.fn()} />)
    const inc = screen.getByRole('button', { name: 'Increase variations' })
    const dec = screen.getByRole('button', { name: 'Decrease variations' })
    expect(useSettingsStore.getState().engineVariations).toBe(1)
    fireEvent.click(dec) // already at min
    expect(useSettingsStore.getState().engineVariations).toBe(1)
    fireEvent.click(inc)
    fireEvent.click(inc)
    fireEvent.click(inc) // would be 4, clamps at 3
    expect(useSettingsStore.getState().engineVariations).toBe(3)
  })

  it('toggles Show engine move arrow', () => {
    render(<SettingsPanel onClose={vi.fn()} />)
    // Default is ON; clicking turns it off.
    expect(useSettingsStore.getState().showEngineArrow).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /show engine move arrow/i }))
    expect(useSettingsStore.getState().showEngineArrow).toBe(false)
  })
})

describe('SettingsPanel — comment source and translation', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset()
  })

  it('chooses which comments to prefer: books, Lichess or both (default books)', () => {
    render(<SettingsPanel onClose={vi.fn()} />)
    const select = screen.getByLabelText('Preferred comment source') as HTMLSelectElement
    expect(select.value).toBe('books')
    expect([...select.options].map((o) => o.value)).toEqual(['books', 'lichess', 'both'])
    fireEvent.change(select, { target: { value: 'lichess' } })
    expect(useSettingsStore.getState().commentSourcePriority).toBe('lichess')
  })

  it('offers translating missing comments only when the AI assistant is set up', () => {
    const { unmount } = render(<SettingsPanel onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /translate borrowed comments/i })).toBeNull()
    unmount()
    useSettingsStore.setState({ aiProvider: 'ollama', aiBaseUrl: 'http://localhost:11434/v1', aiModel: 'm' })
    render(<SettingsPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /translate borrowed comments/i }))
    expect(useSettingsStore.getState().translateMissingComments).toBe(true)
  })
})

describe('SettingsPanel — normalize while commenting', () => {
  it('is offered only with an AI assistant, and can be turned off', () => {
    useSettingsStore.getState().reset()
    const { unmount } = render(<SettingsPanel onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /standardise borrowed comments/i })).toBeNull()
    unmount()
    useSettingsStore.setState({ aiProvider: 'ollama', aiBaseUrl: 'http://localhost:11434/v1', aiModel: 'm' })
    render(<SettingsPanel onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /standardise borrowed comments/i }))
    expect(useSettingsStore.getState().normalizeWhileCommenting).toBe(false)
  })
})

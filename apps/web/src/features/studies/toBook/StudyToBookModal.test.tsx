import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import StudyToBookModal from './StudyToBookModal'
import StudiesTab from '../StudiesTab'
import type { StudiesClient, Study } from '../studiesApi'
import type { StudyBookPayload } from './buildBook'
import { useBusyStore } from '../../../shared/layout/busyStore'

vi.mock('./coverDesigns', async (orig) => ({ ...(await orig<typeof import('./coverDesigns')>()), renderCover: vi.fn(async () => ({ mime: 'image/png', data: 'UE5H' })) }))

const PGN = `[Event "Invented"]
[ChapterName "Ideas"]

{ Intro text. } 1. e4 { Central pawn. } e5 2. Nf3 $1 { Developing with a threat. } 2... Nc6 3. Bb5? { Not the point. } *`
const evaluate = vi.fn(async () => ({ engine: 'FakeFish', depth: 9, lines: [{ pv: ['e2e4'], scoreCp: 30 }], at: 0 }))

function renderModal(extra: Partial<React.ComponentProps<typeof StudyToBookModal>> = {}) {
  const post = vi.fn<(b: StudyBookPayload) => Promise<{ bookId: number }>>(async () => ({ bookId: 7 }))
  const props = { study: { name: 'Invented study', author: 'ann' }, parts: [{ name: 'Invented study', pgn: PGN }], onClose: vi.fn(), onAdded: vi.fn(), evaluate, post, ...extra }
  render(<QueryClientProvider client={new QueryClient()}><StudyToBookModal {...props} /></QueryClientProvider>)
  return { post, onClose: props.onClose, onAdded: props.onAdded }
}
const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add to library' }))

afterEach(() => { cleanup(); evaluate.mockClear() })

describe('StudyToBookModal', () => {
  it('starts with the study title and author, the engine evaluation on and the generated cover', async () => {
    const { post, onAdded, onClose } = renderModal()
    expect(screen.getByLabelText('Book title')).toHaveValue('Invented study')
    expect(screen.getByLabelText('Book author')).toHaveValue('ann')
    add()
    await waitFor(() => expect(post).toHaveBeenCalled())
    const book = post.mock.calls[0][0]
    expect(book).toMatchObject({ title: 'Invented study', author: 'ann', language: 'en', cover: { mime: 'image/png', data: 'UE5H' } })
    expect(book.chapters[0].blocks.some((b) => b.type === 'note')).toBe(true)
    expect(evaluate).toHaveBeenCalled()
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(expect.stringContaining('book 7')))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows its progress in the footer while it works, cancellable', async () => {
    let seen: { label: string; cancellable: boolean } | null = null
    const post = vi.fn(async () => { const t = useBusyStore.getState().tasks[0]; seen = { label: t.label, cancellable: !!t.cancel }; return { bookId: 1 } })
    renderModal({ post })
    add()
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(seen).toEqual({ label: 'Adding the study to the library', cancellable: true })
    await waitFor(() => expect(useBusyStore.getState().tasks).toHaveLength(0))
  })

  it('leaves out the evaluation when it is unchecked', async () => {
    const { post } = renderModal()
    fireEvent.click(screen.getByLabelText('Engine evaluation under each diagram'))
    add()
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(evaluate).not.toHaveBeenCalled()
    expect(post.mock.calls[0][0].chapters[0].blocks.some((b) => b.type === 'note')).toBe(false)
  })

  it('lists the commented main-line moves and the switches tick the good and bad ones', async () => {
    const { post } = renderModal()
    const nf3 = screen.getByLabelText(/Diagram for Ideas 2\. Nf3!/)
    const bb5 = screen.getByLabelText(/Diagram for Ideas 3\. Bb5\?/)
    expect(nf3).not.toBeChecked()
    fireEvent.click(screen.getByLabelText(/after a good move/))
    fireEvent.click(screen.getByLabelText(/after a bad move/))
    expect(nf3).toBeChecked()
    expect(bb5).toBeChecked()
    fireEvent.click(bb5)
    expect(bb5).not.toBeChecked()
    fireEvent.click(screen.getByLabelText('Engine evaluation under each diagram'))
    add()
    await waitFor(() => expect(post).toHaveBeenCalled())
    // start diagram + the Nf3 diagram; Bb5 was switched off by hand
    expect(post.mock.calls[0][0].chapters[0].blocks.filter((b) => b.type === 'img')).toHaveLength(2)
  })

  it('translates through the AI assistant only when one is set up', async () => {
    renderModal()
    expect(screen.getByLabelText('Translate to the book language')).toBeDisabled()
    cleanup()
    const complete = vi.fn(async () => ({ text: '{"text": "Peón central."}' }))
    const { post } = renderModal({ complete: complete as never })
    fireEvent.change(screen.getByLabelText('Book language'), { target: { value: 'es' } })
    fireEvent.click(screen.getByLabelText('Translate to the book language'))
    fireEvent.click(screen.getByLabelText('Engine evaluation under each diagram'))
    add()
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(complete).toHaveBeenCalled()
    expect(post.mock.calls[0][0].language).toBe('es')
    expect(post.mock.calls[0][0].chapters[0].blocks).toContainEqual({ type: 'p', text: 'Peón central.' })
  })

  it('offers several generated cover designs to pick from, and an uploaded image', async () => {
    const { post } = renderModal()
    expect(screen.getAllByRole('radio', { name: /Cover design/ }).length).toBeGreaterThanOrEqual(3)
    fireEvent.click(screen.getByLabelText('Upload an image'))
    add()
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a cover image')
    expect(post).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Cover image'), { target: { files: [new File([new Uint8Array([1, 2, 3])], 'c.png', { type: 'image/png' })] } })
    await screen.findByText(/Chosen: c.png/)
    add()
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][0].cover).toEqual({ mime: 'image/png', data: btoa('\x01\x02\x03') })
  })

  it('shows the API error and keeps the dialog open', async () => {
    const { onClose } = renderModal({ post: vi.fn(async () => { throw new Error('The book could not be added') }) })
    add()
    expect(await screen.findByRole('alert')).toHaveTextContent('The book could not be added')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('needs a title', async () => {
    const { post } = renderModal()
    fireEvent.change(screen.getByLabelText('Book title'), { target: { value: ' ' } })
    add()
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the book a title')
    expect(post).not.toHaveBeenCalled()
  })
})

describe('Studies tab: Add to library', () => {
  const study: Study = { id: 'abcd1234', name: 'My study', author: 'ann', chapters: 1, games: 1, comments: 1, linkedIds: [], groupId: null, partOrder: null, isBook: false, source: 'lichess', updatedAt: null, importedAt: null, myRating: null, lichessLikes: null }
  it('loads the study PGN and opens the conversion dialog', async () => {
    const client = { list: vi.fn(async () => ({ studies: [study], authors: [] })), get: vi.fn(async () => ({ study, pgn: PGN })) } as unknown as StudiesClient
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><StudiesTab client={client} /></MemoryRouter></QueryClientProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Add My study to the library as a book' }))
    expect(await screen.findByRole('dialog', { name: 'Add to library as a book' })).toBeInTheDocument()
    expect(screen.getByLabelText('Book title')).toHaveValue('My study')
    expect(client.get).toHaveBeenCalledWith('abcd1234')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Chess } from 'chess.js'

// llm-assistant-round S8 (and S5's edit button): the reader's edit mode inserts
// text, diagrams, HTML/Markdown and images between the blocks of a chapter and
// corrects a paragraph; everything is saved as a suggestion and shown in place.

const env = vi.hoisted(() => ({
  save: vi.fn(),
  upload: vi.fn(),
  server: { value: false },
  llm: { available: false, vision: false, config: null, complete: vi.fn() },
}))

const HTML = [
  '<p>Opening remarks.</p>',
  '<p>1.e4 e5 2.Nf3 Nc6</p>',
  '<p>Side note (2...d6 3.d4) for later.</p>',
  '<p>Closing words with a tpyo.</p>',
].join('\n')

vi.mock('../../api/libraryApi', () => ({
  useChapter: () => ({ data: { title: 'Chapter', html: HTML, toc: [] }, isLoading: false }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
  useBookTitle: () => 'Test Book',
}))
vi.mock('react-chessboard', () => ({ Chessboard: () => <div data-testid="chessboard" /> }))
vi.mock('../../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 0, depth: 10 }),
}))
vi.mock('../../../suggestions/suggestionsApi', async (orig) => ({
  ...(await orig<typeof import('../../../suggestions/suggestionsApi')>()),
  saveSuggestion: (...a: unknown[]) => env.save(...a),
}))
vi.mock('../../../suggestions/epubApi', async (orig) => ({
  ...(await orig<typeof import('../../../suggestions/epubApi')>()),
  uploadSuggestionAsset: (...a: unknown[]) => env.upload(...a),
}))
vi.mock('../../../../shared/api/serverSession', () => ({ hasServerSession: () => env.server.value }))
vi.mock('../../../../shared/llm', async (orig) => ({
  ...(await orig<typeof import('../../../../shared/llm')>()),
  useLlm: () => env.llm,
}))
vi.mock('../../edit/diagramImage', () => ({
  diagramImageSrc: async () => 'data:image/png;base64,AAAA',
}))

import BookReader from '../BookReader'
import { useStudyBoardStore } from '../../store/studyBoardStore'
import { usePendingSuggestions } from '../../../suggestions/pendingSuggestions'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/read/7']}>
        <Routes><Route path="/read/:bookId" element={children} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const fenAfter = (moves: string[]) => {
  const c = new Chess()
  moves.forEach((m) => c.move(m))
  return c.fen()
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  env.save.mockResolvedValue({ saved: true, where: 'server', path: 'p' })
  env.server.value = false
  Object.assign(env.llm, { available: false, vision: false })
  useStudyBoardStore.getState().reset()
  usePendingSuggestions.setState({ items: [] })
  Element.prototype.scrollIntoView = vi.fn()
})

async function openReader() {
  const view = render(<BookReader />, { wrapper })
  await waitFor(() => expect(view.container.querySelector('span[data-san="Nc6"]')).not.toBeNull())
  return view
}

async function enterEditMode() {
  const pencil = screen.getByRole('button', { name: 'Edit mode' })
  expect(pencil).toHaveAttribute('aria-pressed', 'false')
  await userEvent.click(pencil)
  expect(pencil).toHaveAttribute('aria-pressed', 'true')
}

const savedSuggestion = () => env.save.mock.calls[0][0]

describe('edit mode in the reader (S8)', () => {
  it('the pencil shows insert handles between the blocks and hides them when left', async () => {
    await openReader()
    expect(screen.queryByRole('button', { name: 'Insert after block 1' })).toBeNull()
    await enterEditMode()
    expect(screen.getByRole('button', { name: 'Insert after block 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Insert after block 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit paragraph 4' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit mode' }))
    expect(screen.queryByRole('button', { name: 'Insert after block 1' })).toBeNull()
  })

  it('inserts a text after a block: an insert suggestion anchored there, shown in place as pending', async () => {
    const view = await openReader()
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Insert after block 1' }))
    const panel = screen.getByRole('dialog', { name: 'Insert content' })
    await userEvent.type(within(panel).getByLabelText('Text'), 'A new note.')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save suggestion' }))
    await waitFor(() => expect(env.save).toHaveBeenCalledTimes(1))
    const s = savedSuggestion()
    expect(s.kind).toBe('insert')
    expect(s.status).toBe('pending')
    expect(s.author).toBe('user')
    expect(s.target).toEqual({ book: 'Test Book', chapter: 1, anchor: { chapter: 1, blockIndex: 0, quote: 'Opening remarks.' } })
    expect(s.after).toEqual({ html: '<p>A new note.</p>' })
    // Shown right after the first paragraph, marked as pending.
    await waitFor(() => expect(view.container.querySelector('[data-pending-suggestion]')).not.toBeNull())
    const pending = view.container.querySelector('[data-pending-suggestion]')!
    expect(pending.textContent).toContain('A new note.')
    expect(pending.previousElementSibling?.textContent).toBe('Opening remarks.')
    // Leaving edit mode keeps the preview.
    await userEvent.click(screen.getByRole('button', { name: 'Edit mode' }))
    expect(view.container.querySelector('[data-pending-suggestion]')).not.toBeNull()
  })

  it('a diagram starts at the last main-line move, offers the variation of the previous paragraph and validates the FEN', async () => {
    await openReader()
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Insert after block 3' }))
    const panel = screen.getByRole('dialog', { name: 'Insert content' })
    await userEvent.click(within(panel).getByRole('tab', { name: 'Diagram' }))
    const fen = within(panel).getByLabelText('FEN') as HTMLInputElement
    const main = fenAfter(['e4', 'e5', 'Nf3', 'Nc6'])
    const variation = fenAfter(['e4', 'e5', 'Nf3', 'd6', 'd4'])
    expect(fen.value).toBe(main)
    await userEvent.click(within(panel).getByRole('radio', { name: /Variation/ }))
    expect(fen.value).toBe(variation)
    await userEvent.click(within(panel).getByRole('radio', { name: /Main line/ }))
    expect(fen.value).toBe(main)
    expect(within(panel).getByRole('img', { name: 'Diagram preview' })).toBeInTheDocument()

    fireEvent.change(fen, { target: { value: 'not a fen' } })
    expect(within(panel).getByRole('alert')).toHaveTextContent(/FEN/)
    expect(within(panel).getByRole('button', { name: 'Save suggestion' })).toBeDisabled()

    fireEvent.change(fen, { target: { value: variation } })
    await userEvent.click(within(panel).getByRole('button', { name: 'Save suggestion' }))
    await waitFor(() => expect(env.save).toHaveBeenCalledTimes(1))
    const html = (savedSuggestion().after as { html: string }).html
    const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img')!
    expect(img.classList.contains('diagram')).toBe(true)
    expect(img.getAttribute('data-fen')).toBe(variation)
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(savedSuggestion().target.anchor).toEqual({ chapter: 1, blockIndex: 2, quote: 'Side note (2...d6 3.d4) for later.' })
  })

  it('HTML / Markdown is converted, sanitised and previewed live', async () => {
    await openReader()
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Insert after block 4' }))
    const panel = screen.getByRole('dialog', { name: 'Insert content' })
    await userEvent.click(within(panel).getByRole('tab', { name: 'HTML / Markdown' }))
    fireEvent.change(within(panel).getByLabelText('Markdown or HTML'), {
      target: { value: '## Heading\n\nSome **bold** text <script>alert(1)</script>\n\n- one\n- two' },
    })
    const preview = within(panel).getByTestId('insert-preview')
    expect(preview.querySelector('h2')?.textContent).toBe('Heading')
    expect(preview.querySelector('strong')?.textContent).toBe('bold')
    expect(preview.querySelectorAll('li')).toHaveLength(2)
    expect(preview.querySelector('script')).toBeNull()
    await userEvent.click(within(panel).getByRole('button', { name: 'Save suggestion' }))
    await waitFor(() => expect(env.save).toHaveBeenCalledTimes(1))
    const html = (savedSuggestion().after as { html: string }).html
    expect(html).toContain('<h2>Heading</h2>')
    expect(html).not.toContain('script')
  })

  it('an image: uploaded through the server when there is a session, or an external URL', async () => {
    env.server.value = true
    env.upload.mockResolvedValue('/api/suggestions/assets/abc.png')
    await openReader()
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Insert after block 2' }))
    let panel = screen.getByRole('dialog', { name: 'Insert content' })
    await userEvent.click(within(panel).getByRole('tab', { name: 'Image' }))
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'pic.png', { type: 'image/png' })
    await userEvent.upload(within(panel).getByLabelText('Upload an image'), file)
    await waitFor(() => expect(env.upload).toHaveBeenCalledWith(file))
    await userEvent.click(within(panel).getByRole('button', { name: 'Save suggestion' }))
    await waitFor(() => expect(env.save).toHaveBeenCalledTimes(1))
    expect((savedSuggestion().after as { html: string }).html).toContain('src="/api/suggestions/assets/abc.png"')

    await userEvent.click(screen.getByRole('button', { name: 'Insert after block 2' }))
    panel = screen.getByRole('dialog', { name: 'Insert content' })
    await userEvent.click(within(panel).getByRole('tab', { name: 'Image' }))
    await userEvent.type(within(panel).getByLabelText('Image URL'), 'javascript:alert(1)')
    expect(within(panel).getByRole('button', { name: 'Save suggestion' })).toBeDisabled()
    await userEvent.clear(within(panel).getByLabelText('Image URL'))
    await userEvent.type(within(panel).getByLabelText('Image URL'), 'https://example.org/a.png')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save suggestion' }))
    await waitFor(() => expect(env.save).toHaveBeenCalledTimes(2))
    expect((env.save.mock.calls[1][0].after as { html: string }).html).toContain('src="https://example.org/a.png"')
  })

  it('refuses an uploaded image that is not PNG, JPEG or WebP, or too large', async () => {
    await openReader()
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Insert after block 2' }))
    const panel = screen.getByRole('dialog', { name: 'Insert content' })
    await userEvent.click(within(panel).getByRole('tab', { name: 'Image' }))
    const big = new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    await userEvent.upload(within(panel).getByLabelText('Upload an image'), big)
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/1 MB/)
    expect(env.upload).not.toHaveBeenCalled()
  })
})

describe('correcting a paragraph (S5 edit button)', () => {
  it('saves a text suggestion with the paragraph before and after, with a diff preview', async () => {
    await openReader()
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Edit paragraph 4' }))
    const panel = screen.getByRole('dialog', { name: 'Edit paragraph' })
    const box = within(panel).getByLabelText('Corrected text') as HTMLTextAreaElement
    expect(box.value).toBe('Closing words with a tpyo.')
    expect(within(panel).queryByRole('button', { name: 'Suggest an improvement' })).toBeNull()
    fireEvent.change(box, { target: { value: 'Closing words with a typo.' } })
    const diff = within(panel).getByTestId('text-diff')
    expect(diff.querySelector('del')?.textContent).toBe('tpyo.')
    expect(diff.querySelector('ins')?.textContent).toBe('typo.')
    await userEvent.click(within(panel).getByRole('button', { name: 'Save suggestion' }))
    await waitFor(() => expect(env.save).toHaveBeenCalledTimes(1))
    const s = savedSuggestion()
    expect(s.kind).toBe('text')
    expect(s.before).toEqual({ text: 'Closing words with a tpyo.' })
    expect(s.after).toEqual({ text: 'Closing words with a typo.' })
    expect(s.target.anchor).toEqual({ chapter: 1, blockIndex: 3, quote: 'Closing words with a tpyo.' })
  })

  it('with a model, "Suggest an improvement" fills the text, unless it drops a move', async () => {
    Object.assign(env.llm, { available: true })
    env.llm.complete
      .mockResolvedValueOnce({ text: 'Side note for later.', model: 'm' })
      .mockResolvedValueOnce({ text: 'Side note (2...d6 3.d4) for later, fixed.', model: 'm' })
    await openReader()
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Edit paragraph 3' }))
    const panel = screen.getByRole('dialog', { name: 'Edit paragraph' })
    const box = within(panel).getByLabelText('Corrected text') as HTMLTextAreaElement
    await userEvent.click(within(panel).getByRole('button', { name: 'Suggest an improvement' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/moves missing/)
    expect(box.value).toBe('Side note (2...d6 3.d4) for later.')
    await userEvent.click(within(panel).getByRole('button', { name: 'Suggest an improvement' }))
    await waitFor(() => expect(box.value).toBe('Side note (2...d6 3.d4) for later, fixed.'))
    await userEvent.click(within(panel).getByRole('button', { name: 'Save suggestion' }))
    await waitFor(() => expect(env.save).toHaveBeenCalledTimes(1))
    expect(savedSuggestion().author).toBe('ai')
    expect(savedSuggestion().model).toBe('m')
  })
})

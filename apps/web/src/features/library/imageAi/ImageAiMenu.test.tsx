import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const llm = vi.hoisted(() => ({ available: false, vision: false, complete: vi.fn() }))
vi.mock('../../../shared/llm', () => ({
  useLlm: () => ({ ...llm, config: null }),
}))
vi.mock('./imageData', () => ({
  imageDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,AAAA'),
  imageDataOf: vi.fn().mockRejectedValue(new Error('no canvas in tests')),
}))
vi.mock('../../suggestions/suggestionsApi', () => ({
  saveSuggestion: vi.fn().mockResolvedValue({ saved: true, where: 'server', path: 'p' }),
}))

import { readingFromFen } from '@chess-ebook/chess-shared'
import { ImageAiMenu } from './ImageAiMenu'
import { saveSuggestion } from '../../suggestions/suggestionsApi'
import { useSessionFenStore } from './sessionFens'
import { useErrataContext } from '../errata/errataContext'
import { registerDiagram } from './diagramRegistry'

const save = vi.mocked(saveSuggestion)
const SRC = '/api/library/books/16/images/d1.png'
const FEN = '6k1/5pp1/7p/8/8/8/5PPP/R5K1 w - - 0 30'
const MOVES = '30.Ra8+ Kh7 31.h4 g6'

const open = async () => userEvent.click(screen.getByRole('button', { name: 'AI actions for this image' }))

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(llm, { available: false, vision: false })
  useSessionFenStore.setState({ fens: {} })
  useErrataContext.setState({ bookId: 16, bookTitle: 'Mi sistema', chapter: 5, applied: [] })
})

describe('ImageAiMenu', () => {
  it('shows nothing for a known FEN without an AI model and without moves after the image', () => {
    render(<ImageAiMenu src={SRC} alt="d" followingText="Just prose." fenKnown />)
    expect(screen.queryByRole('button', { name: 'AI actions for this image' })).toBeNull()
  })

  it('shows the control for an unknown FEN even without an AI model and without moves', async () => {
    render(<ImageAiMenu src={SRC} alt="d" followingText="Just prose." />)
    await open()
    const menu = screen.getByRole('menu', { name: 'AI actions' })
    expect(within(menu).getByRole('menuitem', { name: 'Read this diagram (learn from the book)' })).toBeEnabled()
  })

  it('without an AI model the model actions are disabled with a hint; the solver from the moves stays', async () => {
    render(<ImageAiMenu src={SRC} alt="d" followingText={MOVES} />)
    await open()
    const menu = screen.getByRole('menu', { name: 'AI actions' })
    expect(within(menu).getByRole('menuitem', { name: 'Find the position from the moves' })).toBeEnabled()
    expect(within(menu).getByRole('menuitem', { name: 'Find positions of all diagrams in this chapter' })).toBeEnabled()
    for (const name of ['Describe / extract', 'Redraw clearly', 'Find the position']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeDisabled()
    }
    expect(within(menu).getByText('Set up an AI model in Settings to use the model actions.')).toBeInTheDocument()
  })

  it('with a vision model offers describe, redraw and find the position', async () => {
    Object.assign(llm, { available: true, vision: true })
    render(<ImageAiMenu src={SRC} alt="d" followingText="" />)
    await open()
    for (const name of ['Describe / extract', 'Redraw clearly', 'Find the position']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('describe: previews the sanitised answer next to the original; Accept saves an insert suggestion after the image block', async () => {
    Object.assign(llm, { available: true, vision: true })
    llm.complete.mockResolvedValue({ text: '<table><tr><td onclick="x()">Cell</td></tr></table><script>bad()</script>', model: 'llava' })
    const root = document.createElement('div')
    root.className = 'epub-content'
    root.innerHTML = '<p>Intro</p><p id="host"></p><p>After</p>'
    document.body.appendChild(root)
    render(<ImageAiMenu src={SRC} alt="d" followingText="" />, { container: root.querySelector('#host') as HTMLElement })
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Describe / extract' }))
    const preview = await screen.findByTestId('ai-preview')
    expect(preview.innerHTML).toBe('<table><tbody><tr><td>Cell</td></tr></tbody></table>')
    expect(llm.complete.mock.calls[0][0].messages[0].images).toEqual(['data:image/png;base64,AAAA'])
    expect(screen.getByRole('img', { name: 'Original image' })).toHaveAttribute('src', SRC)
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const s = save.mock.calls[0][0]
    expect(s).toMatchObject({
      kind: 'insert', author: 'ai', model: 'llava',
      target: { book: 'Mi sistema', chapter: 5, image: SRC, anchor: { chapter: 5, blockIndex: 1, quote: '' } },
      after: { html: '<table><tbody><tr><td>Cell</td></tr></tbody></table>' },
    })
    expect(await screen.findByText(/saved on the server/i)).toBeInTheDocument()
    root.remove()
  })

  it('Reject closes the preview without saving', async () => {
    Object.assign(llm, { available: true, vision: true })
    llm.complete.mockResolvedValue({ text: '- a\n- b', model: 'm' })
    render(<ImageAiMenu src={SRC} alt="d" followingText="" />)
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Redraw clearly' }))
    expect((await screen.findByTestId('ai-preview')).innerHTML).toBe('<ul><li>a</li><li>b</li></ul>')
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.queryByTestId('ai-preview')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('find the position from the moves: shows the thumbnail and how many moves play; Accept saves a diagram-fen suggestion and sets the FEN for this session', async () => {
    const onFen = vi.fn()
    render(<ImageAiMenu src={SRC} alt="d" followingText={MOVES} onFen={onFen} />)
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Find the position from the moves' }))
    expect(await screen.findByText('4/4 following moves play')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Found position' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    const s = save.mock.calls[0][0]
    expect(s).toMatchObject({ kind: 'diagram-fen', author: 'user', target: { image: SRC, book: 'Mi sistema' } })
    const fen = (s.after as { fen: string }).fen
    expect(useSessionFenStore.getState().fens[SRC]).toBe(fen)
    expect(onFen).toHaveBeenCalledWith(fen)
  })

  it('find the position with a vision model: its reading goes into the solver', async () => {
    Object.assign(llm, { available: true, vision: true })
    llm.complete.mockResolvedValue({ text: JSON.stringify({ sideToMove: 'w', squares: readingFromFen(FEN, 0.9) }), model: 'llava' })
    render(<ImageAiMenu src={SRC} alt="d" followingText={MOVES} />)
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Find the position' }))
    expect(await screen.findByText('4/4 following moves play')).toBeInTheDocument()
    expect(screen.getByText(/No squares changed/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save.mock.calls[0][0]).toMatchObject({ author: 'ai', model: 'llava', after: { fen: FEN.replace(' 0 30', ' 0 30') } })
  })

  it('a vision answer that is not a board is reported, not used', async () => {
    Object.assign(llm, { available: true, vision: true })
    llm.complete.mockResolvedValue({ text: '{"squares": []}', model: 'm' })
    render(<ImageAiMenu src={SRC} alt="d" followingText={MOVES} />)
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Find the position' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/64/)
  })

  it('batch: finds the positions of every diagram of the chapter and accepts them all', async () => {
    const other = '/api/library/books/16/images/d2.png'
    const offA = registerDiagram({ src: SRC, followingText: MOVES, element: null })
    const offB = registerDiagram({ src: other, followingText: '12.Nf3 Nc6', element: null })
    render(<ImageAiMenu src={SRC} alt="d" followingText={MOVES} />)
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Find positions of all diagrams in this chapter' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept all' })).toBeEnabled())
    const rows = screen.getAllByTestId('batch-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('4/4 following moves play')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(Object.keys(useSessionFenStore.getState().fens).sort()).toEqual([SRC, other].sort())
    offA(); offB()
  })
})

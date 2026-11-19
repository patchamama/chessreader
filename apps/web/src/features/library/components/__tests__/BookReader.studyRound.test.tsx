import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BookReader from '../BookReader'
import { useStudyBoardStore } from '../../store/studyBoardStore'
import { useAnalysisBoards } from '../../analysis/analysisBoards'

// study-round T3: interactive lines in comments (S5), square hints on a
// thumbnail (S7) and the per-game comment layout switch on a book that writes
// its comments as paragraphs (S10).

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

// S10: the shape of Kasparov III, game 298 (moves in bold paragraphs, prose
// comments between them, a diagram with an engine line in Spanish letters).
const PETROSIAN = `
<p>Su duelo con Vasili Smyslov es un clásico, en el que no temió jugar el agudo Gambito Tolush-Geller.</p>
<p style="text-align:center;">Partida 298</p>
<p style="text-align:center;"><b>T. Petrosian-V. Smyslov</b></p>
<p style="text-align:center;"><em>Moscú 1951</em></p>
<p style="text-align:center;"><em>19º Campeonato de la URSS</em></p>
<p style="text-align:center;">Defensa Eslava (D15)</p>
<p class="empty-line"></p>
<p><b>1 d4 d5 2 c4 dxc4 3 Nf3 Nf6 4 Nc3 c6 5 e4!? b5 6 e5</b></p>
<p>Hablando en general, Petrosian y sacrificio no son palabras que los jugadores de ajedrez tiendan a asociar (Spassky, por cierto, en lugar de 6 e5 prefería 6 Qc2!?).</p>
<p><b>6…Nd5 7 a4 e6</b></p>
<p>Si 7…Be6?!, probablemente no hubiera seguido con 8 axb5 Nxc3 9 bxc3 cxb5, sino con 8 Ng5! Nxc3 9 bxc3 Bd5 10 e6! fxe6 11 Bf4 (Taimanov), con peligrosa iniciativa.</p>
<p style="text-align:center; text-indent:0em;"><img alt="" src="../Images/qed_3.jpg"/> </p>
<p style="text-align:center; font-size:70%;">Stockfish 14 eval: [-0.82] 8 Ae2 Ab7 9 O-O Ae7 10 Ce4 h6 11 axb5 cxb5 12 b3 a5</p>
<p><b>8 axb5</b></p>
<p>En opinión de los teóricos, después de la tranquila 8 Be2 Bb7 la iniciativa de las blancas puede llegar a punto muerto.</p>
<p><b>8…Nxc3 9 bxc3 cxb5 10 Ng5 Bb7 11 Qh5 g6</b></p>
<p>Después de 11…Qd7 las blancas probablemente hubieran replicado sencillamente 12 Be2!, como en la partida Furman-Lilienthal.</p>
<p><b>12 Qg4</b></p>
<p>Una posición muy aguda, en la que ambos bandos tienen sus bazas.</p>
`

// S5 + S7: a game with a book comment holding a line, its source link, and a
// prose remark naming a diagonal.
const COMMENTED = `
<p>1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5</p>
<blockquote class="human-comment" data-no-recognition><p>Better is <span class="chess-line" data-line-start="${START}" data-line-moves="e4 e5 Nf3"><span>1.</span> <span class="line-move" data-ply="1">e4</span> <span class="line-move" data-ply="2">e5</span> <span>2.</span> <span class="line-move" data-ply="3">Nf3</span></span> with play. <button type="button" class="line-to-board" data-line-start="${START}" data-line-moves="e4 e5 Nf3">Board</button></p><footer>— Kasparov III <a class="comment-source" data-comment-game="3-12" data-comment-ply="5" href="#">source</a></footer></blockquote>
<p>The bishop on the diagonal a2-g8 is strong; 4. c3 Nf6 5. d4 exd4.</p>
`

const h = vi.hoisted(() => ({ html: '' }))
vi.mock('../../api/libraryApi', () => ({
  useChapter: () => ({ data: { title: 'Chapter', html: h.html, toc: [] }, isLoading: false }),
  useTouchBook: () => ({ mutate: vi.fn(), isPending: false }),
  useBookTitle: () => null,
}))
const loadCommentGame = vi.hoisted(() => vi.fn())
vi.mock('../../analysis/commentGame', () => ({ loadCommentGame }))
vi.mock('react-chessboard', () => ({ Chessboard: () => <div data-testid="chessboard" /> }))
vi.mock('../../../../shared/stockfish/useStockfishEval', () => ({
  useStockfishEval: () => ({ loading: false, scoreCp: 0, depth: 10 }),
}))

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

beforeEach(() => {
  localStorage.clear()
  useStudyBoardStore.getState().reset()
  useAnalysisBoards.setState({ boards: [], active: null })
  loadCommentGame.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
})

const content = (c: HTMLElement) => c.querySelector('.epub-content') as HTMLElement
const paragraphTexts = (c: HTMLElement) => [...content(c).querySelectorAll('p')].map((p) => p.textContent?.trim())

async function renderReader(html: string, san: string) {
  h.html = html
  const view = render(<BookReader />, { wrapper })
  await waitFor(() => expect(view.container.querySelector(`span[data-san="${san}"]`)).not.toBeNull())
  return view
}

describe('per-game layout switch on a book written in paragraphs (S10)', () => {
  it('reads the game as paragraphs although its engine line is read like a comment in braces', async () => {
    await renderReader(PETROSIAN, 'Qg4')
    expect(screen.getByRole('button', { name: 'Game 298: show the comments in braces' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Game 298: show the comments as paragraphs' })).toBeNull()
  })

  it('rewrites the paragraphs into braces in place, and back', async () => {
    const { container } = await renderReader(PETROSIAN, 'Qg4')
    fireEvent.click(screen.getByRole('button', { name: 'Game 298: show the comments in braces' }))
    await waitFor(() => expect(content(container)).toHaveTextContent('6 e5 { Hablando en general'))
    expect(content(container)).toHaveTextContent('7 a4 e6 { Si 7…Be6?!')
    expect(paragraphTexts(container)).not.toContain('8 axb5')
    expect(paragraphTexts(container)).toContain('Su duelo con Vasili Smyslov es un clásico, en el que no temió jugar el agudo Gambito Tolush-Geller.')
    expect(container.querySelector('span[data-san="Qg4"]')).not.toBeNull()
    expect(container.querySelector('span[data-san="Bb7"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Game 298: show the comments as paragraphs' }))
    await waitFor(() => expect(paragraphTexts(container)).toContain('8 axb5'))
    expect(content(container).textContent).not.toContain('{')
    expect(screen.getByRole('button', { name: 'Game 298: show the comments in braces' })).toBeInTheDocument()
  })
})

describe('lines in comments (S5)', () => {
  it('hovering a move of a line shows the position after it on a thumbnail', async () => {
    const { container } = await renderReader(COMMENTED, 'Bc5')
    const nf3 = container.querySelector('span.line-move[data-ply="3"]') as HTMLElement
    fireEvent.mouseOver(nf3)
    const card = await screen.findByTestId('line-move-thumb')
    expect(card.getAttribute('data-fen')).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')
    expect(card.getAttribute('data-last-move')).toBe('g1f3')
  })

  it('clicking a move opens the line in a new analysis board at that move, the study board stays', async () => {
    const { container } = await renderReader(COMMENTED, 'Bc5')
    const before = useStudyBoardStore.getState()
    const node = before.currentNodeId
    fireEvent.click(container.querySelector('span.line-move[data-ply="2"]') as HTMLElement)
    const { boards } = useAnalysisBoards.getState()
    expect(boards).toHaveLength(1)
    expect(boards[0]).toMatchObject({ startFen: START, moves: ['e4', 'e5', 'Nf3'], ply: 2 })
    expect(useStudyBoardStore.getState().currentNodeId).toBe(node)
    expect(useStudyBoardStore.getState().activeGame).toBe(before.activeGame)
  })

  it('the board button opens the whole line in another new analysis board', async () => {
    const { container } = await renderReader(COMMENTED, 'Bc5')
    fireEvent.click(container.querySelector('span.line-move[data-ply="1"]') as HTMLElement)
    fireEvent.click(container.querySelector('button.line-to-board') as HTMLElement)
    const { boards } = useAnalysisBoards.getState()
    expect(boards).toHaveLength(2)
    expect(boards[1]).toMatchObject({ startFen: START, moves: ['e4', 'e5', 'Nf3'], ply: 0 })
  })

  it('the source of a book comment opens in a new tab or in a new analysis board', async () => {
    loadCommentGame.mockResolvedValue({ id: '3-12', white: 'T. Petrosian', black: 'V. Smyslov', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 *' })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container } = await renderReader(COMMENTED, 'Bc5')
    fireEvent.click(container.querySelector('a.comment-source') as HTMLElement)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in a new tab' }))
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/comment\/3-12\?ply=5$/), '_blank', 'noopener')
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(container.querySelector('a.comment-source') as HTMLElement)
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Open in a new analysis board' })) })
    await waitFor(() => expect(useAnalysisBoards.getState().boards).toHaveLength(1))
    expect(loadCommentGame).toHaveBeenCalledWith('3-12')
    expect(useAnalysisBoards.getState().boards[0]).toMatchObject({
      title: 'T. Petrosian – V. Smyslov', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 *', ply: 5,
      text: 'Better is 1. e4 e5 2. Nf3 with play. Board', source: 'Kasparov III',
    })
    open.mockRestore()
  })
})

describe('squares named in a comment (S7)', () => {
  it('hovering shows the diagonal on a thumbnail only; clicking lights it on the study board', async () => {
    const { container } = await renderReader(COMMENTED, 'Bc5')
    const mention = container.querySelector('span[data-iso-key]') as HTMLElement
    expect(mention).not.toBeNull()
    const board = useStudyBoardStore.getState()
    const node = board.currentNodeId
    fireEvent.mouseOver(mention)
    const card = await screen.findByTestId('square-hint-thumb')
    expect(card.getAttribute('data-squares')).toBe('a2 b3 c4 d5 e6 f7 g8')
    expect(useStudyBoardStore.getState().isolatedHighlight).toBeNull()
    expect(useStudyBoardStore.getState().previewBase).toBeNull()
    expect(useStudyBoardStore.getState().currentNodeId).toBe(node)

    fireEvent.mouseOut(mention)
    fireEvent.click(mention)
    expect(useStudyBoardStore.getState().isolatedHighlight?.line).toEqual(['a2', 'b3', 'c4', 'd5', 'e6', 'f7', 'g8'])
  })
})

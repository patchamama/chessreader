import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { GameReviewPanel } from './GameReviewPanel'
import { setReviewEngine, useReviewStore, summarise } from './reviewStore'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useExternalBookStore } from '../../../shared/externalBook/externalBookStore'
import * as exporter from './export/annotatedExport'
import { useBusyStore } from '../../../shared/layout/busyStore'

const TEXT = 'Tutor – Novice, 2024\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#'
const games = recognizeGames(TEXT, { algorithm: 2 })
const main = games[0].tree.mainline

// Level game until Black's 3...Nf6 (position after 3. Bc4 is fine for Black, after 3...Nf6 White mates).
const afterNf6 = games[0].tree.nodes.get(main[5])!.fen
const afterBc4 = games[0].tree.nodes.get(main[4])!.fen

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/read/7']}>
      <Routes>
        <Route path="/read/7" element={<GameReviewPanel games={games} text={TEXT} bookId={7} chapter={1} />} />
        <Route path="/read/-1" element={<p>annotated book</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // No network in tests: the opening database answers nothing.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  useStudyBoardStore.getState().reset()
  useReviewStore.setState({ byTree: new Map(), records: [] })
  useSettingsStore.setState({ language: 'en' })
  setReviewEngine(async (fen) => {
    if (fen === afterNf6) return [{ idx: 1, depth: 8, mate: 1, pv: ['h5f7'] }]
    if (fen === afterBc4) return [{ idx: 1, depth: 8, scoreCp: 30, pv: ['g7g6', 'h5f3', 'g8f6'] }]
    return [{ idx: 1, depth: 8, scoreCp: 20, pv: [] }]
  })
})

describe('GameReviewPanel', () => {
  it('rates both players by name and lists the key moment', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(screen.getByTestId('accuracy-white')).toBeInTheDocument())
    expect(screen.getByTestId('accuracy-white')).toHaveTextContent('Tutor')
    expect(screen.getByTestId('accuracy-black')).toHaveTextContent('Novice')
    const white = Number(screen.getByTestId('accuracy-white').dataset.accuracy)
    const black = Number(screen.getByTestId('accuracy-black').dataset.accuracy)
    expect(white).toBeGreaterThan(black)
    expect(screen.getByText(/3\.\.\. Nf6\?\?/)).toBeInTheDocument()
    expect(screen.getByText(/Better was 3\.\.\. g6 4\. Qf3 Nf6/)).toBeInTheDocument()
  })

  it('a key moment links back to its position', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Go to 3... Nf6' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Go to 3... Nf6' }))
    expect(useStudyBoardStore.getState().currentNodeId).toBe(main[5])
  })

  it('opens the game annotated at the chosen level', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open annotated game' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Commentary level'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open annotated game' }))
    await waitFor(() => expect(screen.getByText('annotated book')).toBeInTheDocument())
    const html = useExternalBookStore.getState().chapters[0].html
    expect(html).toContain('Nf6??')
    expect(html).toContain('Blunder')
    const div = document.createElement('div')
    div.innerHTML = html
    expect(div.textContent).toContain('(3... g6 4. Qf3 Nf6)')
    // The better line is a playable line (S5).
    expect(div.querySelector('.chess-line[data-line-moves="g6 Qf3 Nf6"]')).not.toBeNull()
  })

  it('shows the spinner while the annotated game opens (S3)', async () => {
    const labels: string[] = []
    const unsubscribe = useBusyStore.subscribe((s) => labels.push(...s.tasks.map((x) => x.label)))
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open annotated game' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Open annotated game' }))
    await waitFor(() => expect(screen.getByText('annotated book')).toBeInTheDocument())
    expect(labels).toContain('Open annotated game')
    unsubscribe()
    expect(useBusyStore.getState().tasks).toEqual([])
  })

  it('the regenerate action runs under the spinner (S3)', async () => {
    const labels: string[] = []
    const unsubscribe = useBusyStore.subscribe((s) => labels.push(...s.tasks.map((x) => x.label)))
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /Re-analyse and regenerate all comments/ }))
    await waitFor(() => expect(screen.getByText('annotated book')).toBeInTheDocument())
    expect(labels).toContain('Re-analyse and regenerate all comments')
    unsubscribe()
    expect(useBusyStore.getState().tasks).toEqual([])
  })

  it('downloads the annotated game as Markdown, EPUB, PDF or HTML (S34)', async () => {
    const download = vi.spyOn(exporter, 'downloadAnnotated').mockImplementation(() => {})
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Download format'), { target: { value: 'epub' } })
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(download).toHaveBeenCalledTimes(1)
    const [text, format] = download.mock.calls[0]
    expect(format).toBe('epub')
    expect(text).toContain('Nf6??')
    download.mockRestore()
  })

  it('writes the game as a book: a line per remark and a diagram with its evaluation at the blunder', async () => {
    useSettingsStore.setState({ commentLayout: 'inline', commentDiagrams: false, commentDiagramEval: true })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open annotated game' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'split' } })
    fireEvent.click(screen.getByLabelText('Diagrams at key moments'))
    fireEvent.click(screen.getByRole('button', { name: 'Open annotated game' }))
    const html = useExternalBookStore.getState().chapters[0].html
    expect(html).not.toContain('{')
    expect(html).toMatch(/<p>Blunder/)
    expect(html).toMatch(/<img [^>]*data-fen=/)
    expect(html).toContain('class="diagram-eval"')
    useSettingsStore.setState({ commentLayout: 'inline', commentDiagrams: false })
  })

  it('opens a coach review for the chosen side (S25)', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Coach review/ })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Focus on'), { target: { value: 'black' } })
    fireEvent.click(screen.getByRole('button', { name: /Coach review/ }))
    const html = useExternalBookStore.getState().chapters[0].html
    expect(html).toContain('Coach review for Black')
    expect(html).toMatch(/Blunder\. It allows mate on f7/)
  })

  it('keeps a record per book and chapter and sums players up', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(useReviewStore.getState().records).toHaveLength(1))
    const [record] = useReviewStore.getState().records
    expect(record).toMatchObject({ bookId: 7, chapter: 1, gameIndex: 0, white: 'Tutor', black: 'Novice' })
    expect(screen.getByTestId('book-summary')).toHaveTextContent('Tutor')
    expect(summarise([record, { ...record, gameIndex: 1, accuracyWhite: 50 }]).find((p) => p.name === 'Tutor')!.games).toBe(2)
  })

  it('opens the game on the Lichess analysis board (S1)', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const fetchMock = vi.fn(async () => new Response('{"id":"abc","url":"https://lichess.org/abc"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Analyse on Lichess' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://lichess.org/abc', '_blank', 'noopener'))
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://lichess.org/api/import')
    expect(decodeURIComponent(String(init.body)).replace(/\+/g, ' ')).toContain('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#')
    open.mockRestore()
  })

  it('re-analyses from scratch and regenerates every comment and diagram (S8)', async () => {
    let calls = 0
    setReviewEngine(async (fen) => {
      calls++
      if (fen === afterNf6) return [{ idx: 1, depth: 8, mate: 1, pv: ['h5f7'] }]
      return [{ idx: 1, depth: 8, scoreCp: 20, pv: [] }]
    })
    useSettingsStore.setState({ commentDiagrams: true, commentDiagramEval: true })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open annotated game' })).toBeInTheDocument())
    const first = calls
    fireEvent.click(screen.getByRole('button', { name: 'Re-analyse and regenerate all comments' }))
    await waitFor(() => expect(screen.getByText('annotated book')).toBeInTheDocument())
    expect(calls).toBe(2 * first)
    const html = useExternalBookStore.getState().chapters[0].html
    expect(html).toContain('Nf6??')
    expect(html).toMatch(/<img class="diagram"/)
    expect(html).toMatch(/class="diagram-eval">[^<]*· Stockfish 18 lite, depth \d+/)
  })

  it('regenerating rewrites only the active game, in place, and selects its first move (S8)', async () => {
    const MULTI = 'Immortals\nAnderssen – Kieseritzky\n1. e4 e5 2. Qh5\nA wild queen sortie.\n2... Nc6 3. Bc4 Nf6 4. Qxf7#\nSecond game\n1. d4 d5 2. c4 e6'
    const multi = recognizeGames(MULTI, { algorithm: 2 })
    useSettingsStore.setState({ commentDiagrams: false })
    render(
      <MemoryRouter initialEntries={['/read/7']}>
        <Routes>
          <Route path="/read/7" element={<GameReviewPanel games={multi} text={MULTI} bookId={7} chapter={1} />} />
          <Route path="/read/-1" element={<p>annotated book</p>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Re-analyse and regenerate all comments' }))
    await waitFor(() => expect(screen.getByText('annotated book')).toBeInTheDocument())
    const html = useExternalBookStore.getState().chapters[0].html
    expect(html).toContain('Anderssen – Kieseritzky')
    expect(html).not.toContain('A wild queen sortie.')
    expect(html).toContain('Second game')
    expect(html).toContain('1. d4 d5 2. c4 e6')
    expect(html.indexOf('Qxf7#')).toBeLessThan(html.indexOf('Second game'))
    expect(JSON.parse(localStorage.getItem('chessreader-board-v1') ?? '{}')['-1']).toMatchObject({ chapter: 1, gameIndex: 0, nodeId: null })
  })

  it('the game as PGN and the position shown as FEN can always be downloaded (S20)', async () => {
    const blobs: Blob[] = []
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x' }) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn()
    useStudyBoardStore.getState().loadPosition(games[0].tree, main[1], false)
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Download PGN' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download FEN' }))
    expect(blobs).toHaveLength(2)
    const read = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b) })
    const saved = await Promise.all(blobs.map(async (b) => ({ text: await read(b) })))
    URL.createObjectURL = original.create
    URL.revokeObjectURL = original.revoke
    expect(saved[0].text).toContain('[White "Tutor"]')
    expect(saved[0].text).toContain('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#')
    expect(saved[1].text.trim()).toBe(games[0].tree.nodes.get(main[1])!.fen)
  })

  it('borrows what a book says about a position of the game, with its source (S5)', async () => {
    const lookup = await import('../commentdb/commentLookup')
    const spy = vi.spyOn(lookup, 'humanCommentsForGame').mockResolvedValue({ 4: { text: 'La dama sale demasiado pronto.', source: 'Kasparov, Mis geniales predecesores I, Partida 3' } })
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open annotated game' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Open annotated game' }))
    await waitFor(() => expect(screen.getByText('annotated book')).toBeInTheDocument())
    const html = useExternalBookStore.getState().chapters[0].html
    expect(html).toContain('<blockquote class="human-comment" data-no-recognition><p>La dama sale demasiado pronto.</p><footer>— Kasparov, Mis geniales predecesores I, Partida 3</footer></blockquote>')
    spy.mockRestore()
    useSettingsStore.setState({ commentDbUrl: '' })
  })

  it('a borrowed comment links to the commentary database game and ply it comes from (S5)', async () => {
    const lookup = await import('../commentdb/commentLookup')
    const text = 'La dama sale demasiado pronto.'
    const spy = vi.spyOn(lookup, 'humanCommentsForGame').mockResolvedValue({ 4: { text, source: 'Kasparov, Partida 3' } })
    const spyPos = vi.spyOn(lookup, 'lookupPositionComments').mockResolvedValue([
      { text: 'Otra cosa.', lang: 'es', ply: 3, san: 'Nc6', gameId: 'g1', label: null, source: { kind: 'book', title: 'X', author: null } },
      { text, lang: 'es', ply: 7, san: 'Nc6', gameId: 'g42', label: 'Partida 3', source: { kind: 'book', title: 'MGP I', author: 'Kasparov' } },
    ])
    useSettingsStore.setState({ commentDbUrl: 'https://example.org/db' })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review and comment the game' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open annotated game' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Open annotated game' }))
    await waitFor(() => expect(screen.getByText('annotated book')).toBeInTheDocument())
    const div = document.createElement('div')
    div.innerHTML = useExternalBookStore.getState().chapters[0].html
    const link = div.querySelector('blockquote.human-comment a.comment-source')!
    expect(link.getAttribute('data-comment-game')).toBe('g42')
    expect(link.getAttribute('data-comment-ply')).toBe('7')
    spy.mockRestore()
    spyPos.mockRestore()
    useSettingsStore.setState({ commentDbUrl: '' })
  })
})

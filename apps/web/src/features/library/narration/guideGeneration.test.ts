import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'

const save = vi.hoisted(() => vi.fn(async () => {}))
const lookup = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []))
vi.mock('../../comments/commentsApi', () => ({ setCommentActions: save }))
vi.mock('../commentdb/commentLookup', () => ({ hasCommentSource: () => true, lookupPositionComments: lookup }))

import { collectParagraphJobs, generateGuidesForChapter } from './guideGeneration'
import { guideKey, useGuideStore } from './guideStore'
import { useBusyStore } from '../../../shared/layout/busyStore'

const P1 = 'Con la Defensa Philidor las negras sostienen el peón de e5 con una jugada muy sólida.'
const P2 = 'Una clavada sobre el caballo de f3 que no tiene otra defensa mejor que la captura.'
const TEXT = ['La partida de la Ópera', '1. e4 e5 2. ♘f3 d6', P1, '3. d4 ♗g4', P2, 'Fin.'].join('\n')
const games = recognizeGames(TEXT, { algorithm: 2 })
const answer = (actions: string) => ({ text: JSON.stringify({ actions }), model: 'fake' })

beforeEach(() => {
  useGuideStore.getState().clear()
  save.mockClear()
  lookup.mockReset()
  lookup.mockResolvedValue([])
})

describe('which paragraphs get a guide (ai-narration-guides S2)', () => {
  it('takes the prose paragraphs that follow a move, with the position, side to move and the moves around', () => {
    const jobs = collectParagraphJobs(games, TEXT, { bookId: 7, chapter: 2 })
    expect(jobs.map((j) => j.text)).toEqual([P1, P2])
    const [first, second] = jobs
    expect(first.fen).toBe(games[0].tree.nodes.get(games[0].tree.mainline[3])!.fen)
    expect(first.key).toBe(guideKey(7, 2, P1))
    expect(first.context.previous).toContain('e4')
    expect(first.context.previous).toContain('d6')
    expect(first.context.next).toMatch(/d4/)
    expect(second.context.previous).toContain('Bg4')
    expect(second.context.next).toBeUndefined()
  })
})

describe('generating the guides of a chapter (S2, S3)', () => {
  it('asks the model once per paragraph with the position, the moves and the engine lines, and keeps the valid answers locally', async () => {
    const requests: string[] = []
    const complete = vi.fn(async (r: { messages: { text: string }[] }) => { requests.push(r.messages[0].text); return answer('0Square:e5') })
    const evalsFor = vi.fn(async () => ['d4: +0.3'])
    const result = await generateGuidesForChapter({ games, text: TEXT, bookId: 7, chapter: 2, complete, isAdmin: false, evalsFor })
    expect(result).toMatchObject({ total: 2, generated: 2, failed: 0, skipped: 0, cancelled: false })
    expect(requests).toHaveLength(2)
    expect(requests[0]).toContain('Stockfish')
    expect(requests[0]).toContain('just before the comment')
    expect(requests[0]).toContain('0:Con')
    expect(useGuideStore.getState().guides[guideKey(7, 2, P1)]).toMatchObject({ actions: '0Square:e5', text: P1 })
    expect(save).not.toHaveBeenCalled()
  })

  it('never needs the engine: it is optional and a failing one does not stop the paragraph', async () => {
    const complete = vi.fn(async () => answer('0Square:e5'))
    const result = await generateGuidesForChapter({ games, text: TEXT, bookId: 7, chapter: 2, complete, isAdmin: false, evalsFor: async () => { throw new Error('no engine') } })
    expect(result.generated).toBe(2)
  })

  it('tolerates a failing paragraph and reports it; an answer with no valid action is not a failure and stores nothing', async () => {
    let n = 0
    const complete = vi.fn(async () => { n++; if (n === 1) throw new Error('boom'); return answer('0Arrow:e3-e4') })
    const result = await generateGuidesForChapter({ games, text: TEXT, bookId: 7, chapter: 2, complete, isAdmin: false })
    expect(result).toMatchObject({ total: 2, failed: 1, generated: 0, empty: 1 })
    expect(Object.keys(useGuideStore.getState().guides)).toHaveLength(0)
  })

  it('skips paragraphs that already have a guide unless asked to redo', async () => {
    useGuideStore.getState().set(guideKey(7, 2, P1), { text: P1, fen: 'x', actions: '0Clear' })
    const complete = vi.fn(async () => answer('0Square:e5'))
    const first = await generateGuidesForChapter({ games, text: TEXT, bookId: 7, chapter: 2, complete, isAdmin: false })
    expect(first).toMatchObject({ skipped: 1, generated: 1 })
    expect(complete).toHaveBeenCalledTimes(1)
    complete.mockClear()
    const again = await generateGuidesForChapter({ games, text: TEXT, bookId: 7, chapter: 2, complete, isAdmin: false, redo: true })
    expect(again).toMatchObject({ skipped: 0, generated: 2 })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('shows a cancellable progress bar in the status footer, one step per paragraph, and stops when cancelled', async () => {
    const seen: { label: string; progress?: number; cancellable: boolean }[] = []
    const unsub = useBusyStore.subscribe((s) => { const t = s.tasks[0]; if (t) seen.push({ label: t.label, ...(t.progress !== undefined ? { progress: t.progress } : {}), cancellable: !!t.cancel }) })
    const complete = vi.fn(async () => {
      useBusyStore.getState().tasks[0]?.cancel?.()
      return answer('0Square:e5')
    })
    const result = await generateGuidesForChapter({ games, text: TEXT, bookId: 7, chapter: 2, complete, isAdmin: false })
    unsub()
    expect(seen.some((s) => s.cancellable)).toBe(true)
    expect(seen.some((s) => s.progress === 0.5)).toBe(true)
    expect(result).toMatchObject({ cancelled: true, generated: 1 })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(useBusyStore.getState().tasks).toHaveLength(0)
  })

  it('saves a database comment with its comment id when the user is admin, and locally otherwise', async () => {
    const quote = { text: 'Una jugada que prepara el avance del peón de f con mucha energía y claridad.', fen: games[0].tree.nodes.get(games[0].tree.mainline[3])!.fen }
    lookup.mockResolvedValue([{ id: 41, text: quote.text, lang: 'es', ply: 4, san: 'd6', gameId: 'g', label: null, source: { kind: 'book', title: 'B', author: null } }])
    const complete = vi.fn(async () => answer('0Square:e5'))
    const admin = await generateGuidesForChapter({ games: [], text: '', bookId: 7, chapter: 2, complete, isAdmin: true, quotes: [quote] })
    expect(admin).toMatchObject({ generated: 1, savedToDatabase: 1 })
    expect(save).toHaveBeenCalledWith(41, '0Square:e5')
    save.mockClear()
    const reader = await generateGuidesForChapter({ games: [], text: '', bookId: 7, chapter: 2, complete, isAdmin: false, quotes: [quote] })
    expect(reader).toMatchObject({ generated: 1, savedToDatabase: 0 })
    expect(save).not.toHaveBeenCalled()
    expect(useGuideStore.getState().guides[guideKey(7, 2, quote.text)]).toMatchObject({ actions: '0Square:e5' })
  })

  it('skips a database comment that already has actions', async () => {
    const quote = { text: 'Una jugada que prepara el avance del peón de f con mucha energía y claridad.', fen: games[0].tree.startFen }
    lookup.mockResolvedValue([{ id: 41, text: quote.text, actions: '0Clear', lang: 'es', ply: 4, san: 'd6', gameId: 'g', label: null, source: { kind: 'book', title: 'B', author: null } }])
    const complete = vi.fn(async () => answer('0Square:e5'))
    const r = await generateGuidesForChapter({ games: [], text: '', bookId: 7, chapter: 2, complete, isAdmin: true, quotes: [quote] })
    expect(r).toMatchObject({ skipped: 1, generated: 0 })
    expect(complete).not.toHaveBeenCalled()
  })
})

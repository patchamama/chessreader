import { beforeEach, describe, expect, it, vi } from 'vitest'

const save = vi.hoisted(() => vi.fn())
vi.mock('../suggestions/suggestionsApi', () => ({ saveSuggestion: save }))
const game = vi.hoisted(() => vi.fn())
vi.mock('./commentsApi', async (orig) => ({ ...(await orig<typeof import('./commentsApi')>()), loadCommentGame: game }))

import { translateBorrowedComment, proposeComment, proposeGameTranslation, runCommentBatch, runPagedBatch, saveCommentProposal, saveGameProposal } from './commentAi'
import type { CommentEntry } from './commentsApi'

const entry = (id: number, text: string): CommentEntry => ({
  id, hash: '0123456789abcdef', fen: '8/8/8/8/8/8/8/K6k w - - 0 1', text, lang: 'en', ply: 24, move: 12, san: 'Nb6', gameId: '1-1', chapter: 3,
  source: { id: 1, title: 'Invented Book', author: 'A. Writer', kind: 'book', lang: 'en', book: 'invented-book' },
  game: { white: 'W', black: 'B', label: null },
})
const answer = (text: string) => ({ text: JSON.stringify({ text }), model: 'test-model' })

beforeEach(() => {
  save.mockReset()
  save.mockResolvedValue({ saved: true, where: 'server', path: 'p' })
  game.mockReset()
})

describe('AI on comments (S3)', () => {
  it('Test: proposes a universal comment and flags lost moves', async () => {
    const complete = vi.fn().mockResolvedValue(answer('White keeps c4 after Nb6.'))
    const p = await proposeComment(complete, entry(1, 'Smith keeps c4 after 12...Nb6; 13. Bxe6 fails.'), { kind: 'universal' })
    expect(complete.mock.calls[0][0].system).toMatch(/any game that reaches this position/)
    expect(p).toEqual({ text: 'White keeps c4 after Nb6.', lang: 'en', model: 'test-model', problems: ['moves missing from the proposal: Bxe6'] })
  })

  it('Test: a translation keeps the target language', async () => {
    const complete = vi.fn().mockResolvedValue(answer('Las blancas mantienen c4 tras 12...Cb6.'))
    const p = await proposeComment(complete, entry(1, 'White keeps c4 after 12...Nb6.'), { kind: 'translate', lang: 'es' })
    expect(p).toMatchObject({ lang: 'es', problems: [] })
  })

  it('Save: a pending "comment" or "translation" suggestion for the comment', async () => {
    const c = entry(7, 'Smith keeps c4.')
    await saveCommentProposal(c, { kind: 'universal' }, { text: 'White keeps c4.', lang: 'en', model: 'm', problems: [] })
    expect(save.mock.calls[0][0]).toMatchObject({
      kind: 'comment', status: 'pending', author: 'ai', model: 'm',
      target: { book: 'Invented Book', commentId: 7, chapter: 3 },
      before: { text: 'Smith keeps c4.', lang: 'en' }, after: { text: 'White keeps c4.', lang: 'en', action: 'universal' },
    })
    await saveCommentProposal({ ...c, chapter: null }, { kind: 'translate', lang: 'de' }, { text: 'Weiß hält c4.', lang: 'de', model: 'm', problems: [] })
    expect(save.mock.calls[1][0]).toMatchObject({ kind: 'translation', target: { book: 'Invented Book', commentId: 7 }, after: { lang: 'de' } })
    expect(save.mock.calls[1][0].target).not.toHaveProperty('chapter')
  })

  it('Batch: each result saved as pending, flagged and failed ones counted, cancel stops', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(answer('White keeps c4.'))
      .mockResolvedValueOnce(answer('Lost.'))
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce(answer('Not stored.'))
    save.mockResolvedValueOnce({ saved: true, where: 'server', path: 'a' }).mockResolvedValueOnce({ saved: false, path: 'b', json: '{"id":"b"}' })
    const report = vi.fn()
    const result = await runCommentBatch(complete, [entry(1, 'Keeps c4.'), entry(2, 'After Bxe6.'), entry(3, 'Fine.'), entry(4, 'Also.')], { kind: 'universal' }, { report, signal: new AbortController().signal })
    expect(result).toEqual({ saved: 1, flagged: 1, failed: 1, unsaved: ['{"id":"b"}'], cancelled: false })
    expect(report).toHaveBeenLastCalledWith(4, 4)
    const stop = new AbortController()
    stop.abort()
    expect(await runCommentBatch(complete, [entry(1, 'x')], { kind: 'universal' }, { report, signal: stop.signal })).toMatchObject({ saved: 0, cancelled: true })
  })

  it('Translate the game: every {comment} translated, the moves untouched, saved as a "game" suggestion', async () => {
    game.mockResolvedValue({ id: '1-1', white: 'W', black: 'B', pgn: '1. e4 {A sharp start.} e5 2. Nf3 {The knight hits e5.} Nc6 *' })
    const complete = vi.fn().mockResolvedValue({ text: JSON.stringify({ comments: ['Un comienzo agudo.', 'El caballo ataca e5.'] }), model: 'm' })
    const c = entry(1, 'x')
    const p = await proposeGameTranslation(complete, c, 'es')
    expect(p).toEqual({ gameId: '1-1', before: '1. e4 {A sharp start.} e5 2. Nf3 {The knight hits e5.} Nc6 *', after: '1. e4 {Un comienzo agudo.} e5 2. Nf3 {El caballo ataca e5.} Nc6 *', lang: 'es', model: 'm', problems: [] })
    await saveGameProposal(c, p)
    expect(save.mock.calls[0][0]).toMatchObject({ kind: 'game', target: { book: 'Invented Book', chapter: 3, commentId: 1 }, before: { gameId: '1-1', pgn: p.before }, after: { gameId: '1-1', pgn: p.after, lang: 'es' } })
  })

  it('Translate the game: a game without comments says so', async () => {
    game.mockResolvedValue({ id: '1-1', white: null, black: null, pgn: '1. e4 e5 *' })
    await expect(proposeGameTranslation(vi.fn(), entry(1, 'x'), 'es')).rejects.toThrow(/no comments/)
  })
})

describe('Paged batch (S1)', () => {
  const withT = (id: number, translations?: Record<string, string>, over: Partial<CommentEntry> = {}): CommentEntry => ({ ...entry(id, `Comment ${id} keeps c4.`), ...(translations ? { translations } : {}), ...over })
  const loader = (all: CommentEntry[]) => vi.fn(async (offset: number, limit: number) => ({ total: all.length, comments: all.slice(offset, offset + limit) }))
  const run = async (all: CommentEntry[], extra: Partial<Parameters<typeof runPagedBatch>[2]> = {}, complete = vi.fn(async () => answer('Comment keeps c4 here.'))) => {
    const load = loader(all)
    const progress: Array<{ done: number; total: number }> = []
    const result = await runPagedBatch(complete as never, load, { actions: [{ kind: 'translate', lang: 'es' }], overwrite: false, pageSize: 2, signal: new AbortController().signal, report: () => {}, onProgress: (p) => progress.push({ done: p.done, total: p.total }), ...extra })
    return { result, load, progress, complete }
  }

  it('reads the list lazily page by page and reports done/total', async () => {
    const { result, load, progress } = await run([withT(1), withT(2), withT(3)])
    expect(load.mock.calls.map((c) => [c[0], c[1]])).toEqual([[0, 2], [2, 2]])
    expect(progress.at(-1)).toEqual({ done: 3, total: 3 })
    expect(result).toMatchObject({ saved: 3, skipped: 0, done: 3, total: 3 })
  })

  it('skips comments that already have the target language unless overwrite is on', async () => {
    const all = [withT(1, { es: 'Ya traducido' }), withT(2, {}), withT(3, undefined)]
    const off = await run(all)
    expect(off.result).toMatchObject({ saved: 2, skipped: 1 })
    expect(off.complete).toHaveBeenCalledTimes(2)
    const on = await run(all, { overwrite: true })
    expect(on.result).toMatchObject({ saved: 3, skipped: 0 })
  })

  it('treats the universal text as the translation in the comment own language', async () => {
    const { result } = await run([withT(1, { en: 'Universal.' }), withT(2, {})], { actions: [{ kind: 'universal' }] })
    expect(result).toMatchObject({ saved: 1, skipped: 1 })
  })

  it('never translates a comment into its own language', async () => {
    const { result } = await run([withT(1, {}, { lang: 'es' })], { overwrite: true })
    expect(result).toMatchObject({ saved: 0, skipped: 1 })
  })

  it('runs several actions on each comment', async () => {
    const { result, complete } = await run([withT(1)], { actions: [{ kind: 'universal' }, { kind: 'translate', lang: 'de' }] })
    expect(complete).toHaveBeenCalledTimes(2)
    expect(result.saved).toBe(2)
  })

  it('stops between comments when cancelled and keeps the counts', async () => {
    const stop = new AbortController()
    const complete = vi.fn(async () => { stop.abort(); return answer('Comment keeps c4 here.') })
    const { result } = await run([withT(1), withT(2), withT(3)], { signal: stop.signal }, complete)
    expect(result).toMatchObject({ saved: 1, cancelled: true, done: 1 })
  })

  it('counts failed comments and goes on', async () => {
    const complete = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(answer('Comment keeps c4 here.'))
    const { result } = await run([withT(1), withT(2)], {}, complete)
    expect(result).toMatchObject({ failed: 1, saved: 1, done: 2 })
  })
})

describe('translateBorrowedComment', () => {
  const borrowed = (over: Partial<import('../library/commentdb/commentLookup').HumanComment & { fen: string }> = {}) => ({
    id: 5, text: 'Smith keeps c4 after 12...Nb6.', lang: 'en', ply: 24, san: 'Nb6', gameId: '1-1', label: null,
    source: { kind: 'book', title: 'Invented Book', author: 'A. Writer' }, fen: '8/8/8/8/8/8/8/K6k w - - 0 1', ...over,
  })

  it('standardises, then translates, and saves both as pending AI suggestions', async () => {
    const complete = vi.fn().mockResolvedValueOnce(answer('White keeps c4 after 12...Nb6.')).mockResolvedValueOnce(answer('Die Weissen halten c4 nach 12...Sb6.'))
    const text = await translateBorrowedComment(complete, borrowed(), 'de', new Map())
    expect(text).toBe('Die Weissen halten c4 nach 12...Sb6.')
    expect(save).toHaveBeenCalledTimes(2)
    for (const call of save.mock.calls) {
      const s = call[0]
      expect(s.status).toBe('pending')
      expect(s.author).toBe('ai')
      expect(s.target.commentId).toBe(5)
    }
    expect(save.mock.calls[0][0].kind).toBe('comment')
    expect(save.mock.calls[1][0].kind).toBe('translation')
  })

  it('skips the standardising step when the comment already has a universal text', async () => {
    const complete = vi.fn().mockResolvedValue(answer('Die Weissen halten c4 nach 12...Sb6.'))
    const text = await translateBorrowedComment(complete, borrowed({ translations: { en: 'White keeps c4 after 12...Nb6.' } }), 'de', new Map())
    expect(text).toBe('Die Weissen halten c4 nach 12...Sb6.')
    expect(complete).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('only standardises when the comment is already in the reader\'s language', async () => {
    const complete = vi.fn().mockResolvedValue(answer('White keeps c4 after 12...Nb6.'))
    expect(await translateBorrowedComment(complete, borrowed(), 'en', new Map())).toBe('White keeps c4 after 12...Nb6.')
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('returns null, saves nothing and never throws when the proposal has problems or the model fails', async () => {
    expect(await translateBorrowedComment(vi.fn().mockResolvedValue(answer('')), borrowed(), 'de', new Map())).toBeNull()
    expect(await translateBorrowedComment(vi.fn().mockRejectedValue(new Error('down')), borrowed({ id: 6 }), 'de', new Map())).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('does not ask twice for the same comment and language in one session', async () => {
    const complete = vi.fn().mockResolvedValue(answer('Die Weissen halten c4 nach 12...Sb6.'))
    const cache = new Map()
    const c = borrowed({ translations: { en: 'White keeps c4 after 12...Nb6.' } })
    await translateBorrowedComment(complete, c, 'de', cache)
    await translateBorrowedComment(complete, c, 'de', cache)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it('a comment without an id is still translated for the game but not saved', async () => {
    const complete = vi.fn().mockResolvedValue(answer('Die Weissen halten c4 nach 12...Sb6.'))
    const text = await translateBorrowedComment(complete, borrowed({ id: undefined, translations: { en: 'White keeps c4 after 12...Nb6.' } }), 'de', new Map())
    expect(text).toBe('Die Weissen halten c4 nach 12...Sb6.')
    expect(save).not.toHaveBeenCalled()
  })
})

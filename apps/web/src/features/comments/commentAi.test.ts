import { beforeEach, describe, expect, it, vi } from 'vitest'

const save = vi.hoisted(() => vi.fn())
vi.mock('../suggestions/suggestionsApi', () => ({ saveSuggestion: save }))
const game = vi.hoisted(() => vi.fn())
vi.mock('./commentsApi', async (orig) => ({ ...(await orig<typeof import('./commentsApi')>()), loadCommentGame: game }))

import { proposeComment, proposeGameTranslation, runCommentBatch, saveCommentProposal, saveGameProposal } from './commentAi'
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

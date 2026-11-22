import { describe, it, expect, vi } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { htmlToProseText } from '../utils/proseText'
import { pgnToChapters } from '../../gamesearch/pgnChapters'
import { prepareChapterHtml } from '../utils/epubContent'
import type { LlmRequest } from '../../../shared/llm'
import { gameTranslationUnits, translateGameText } from './translateGame'

const FEN = '7k/8/8/8/8/8/8/R6K w - - 0 1'
const pgn = `[Event "S"]\n[ChapterName "Ex.1"]\n[SetUp "1"]\n[FEN "${FEN}"]\n\n{ In this position the power of the Rook is demonstrated, } 1. Ra7 Kg8 { which confines the King to the last rank. } 2. Kg2 Kf8 3. Kf3 *`
const html = prepareChapterHtml(pgnToChapters(pgn, { fromPosition: true }).chapters[0].html, -1)
const setup = () => {
  const text = htmlToProseText(html)
  const games = recognizeGames(text, { algorithm: 2 })
  return { text, game: games[0] }
}

describe('gameTranslationUnits', () => {
  it('splits a game into move lines (kept) and comment lines (to translate), each comment with the position it follows', () => {
    const { text, game } = setup()
    expect(game).toBeDefined()
    const { lines } = gameTranslationUnits(text, game, FEN)
    const comments = lines.filter((l) => l.kind === 'comment')
    expect(comments.map((c) => c.text)).toEqual([
      'In this position the power of the Rook is demonstrated,',
      'which confines the King to the last rank.',
    ])
    expect(comments[0].fen).toBe(FEN)
    expect(comments[0].move).toBe('')
    expect(comments[1].move).toBe('1...Kg8')
    expect(comments[1].fen).toContain('6k1')
    expect(lines.filter((l) => l.kind === 'moves').map((l) => l.text)).toEqual(['1. Ra7 Kg8', '2. Kg2 Kf8 3. Kf3 *'])
  })
})

describe('translateGameText', () => {
  it('translates every comment on its own with the chess prompt and keeps the move lines as they are', async () => {
    const { text, game } = setup()
    const complete = vi.fn(async (req: LlmRequest) => {
      const said = req.messages[0].text
      return { text: JSON.stringify({ text: said.includes('power') ? 'En esta posición se muestra el poder de la torre,' : 'que confina al rey a la última fila.' }), model: 'm' }
    })
    const out = await translateGameText(complete, text, game, 'es', FEN)
    expect(complete).toHaveBeenCalledTimes(2)
    expect(complete.mock.calls[0][0].system).toContain('chess')
    expect(out.text).toBe('En esta posición se muestra el poder de la torre,\n1. Ra7 Kg8\nque confina al rey a la última fila.\n2. Kg2 Kf8 3. Kf3 *')
    expect(out.comments).toHaveLength(2)
    expect(out.comments[0]).toMatchObject({ ply: 0, move: 0, san: '@intro' })
    expect(out.comments[1]).toMatchObject({ original: 'which confines the King to the last rank.', translated: 'que confina al rey a la última fila.', ply: 2, san: 'Kg8' })
    expect(out.problems).toEqual([])
  })

  it('keeps the original comment, and reports it, when the model answer is flagged', async () => {
    const { text, game } = setup()
    const complete = vi.fn(async () => ({ text: JSON.stringify({ text: 'palabra '.repeat(80) }), model: 'm' }))
    const out = await translateGameText(complete, text, game, 'es', FEN)
    expect(out.text).toContain('In this position the power of the Rook is demonstrated,')
    expect(out.comments.map((c) => c.translated)).toEqual([null, null])
    expect(out.problems).toHaveLength(2)
  })

  it('stops quietly when cancelled', async () => {
    const { text, game } = setup()
    const ctl = new AbortController()
    ctl.abort()
    await expect(translateGameText(vi.fn(), text, game, 'es', FEN, { signal: ctl.signal })).rejects.toThrow()
  })
})

describe('the game as a PGN, in each language', () => {
  it('gives the original and the translated text as PGN with the comments in braces, and the starting position', async () => {
    const { text, game } = setup()
    const complete = vi.fn(async (req: LlmRequest) => ({ text: JSON.stringify({ text: req.messages[0].text.includes('power') ? 'El poder de la torre,' : 'que confina al rey.' }), model: 'm' }))
    const out = await translateGameText(complete, text, game, 'es', FEN)
    expect(out.originalPgn).toBe(`[SetUp "1"]\n[FEN "${FEN}"]\n\n{ In this position the power of the Rook is demonstrated, } 1. Ra7 Kg8 { which confines the King to the last rank. } 2. Kg2 Kf8 3. Kf3 *`)
    expect(out.pgn).toBe(`[SetUp "1"]\n[FEN "${FEN}"]\n\n{ El poder de la torre, } 1. Ra7 Kg8 { que confina al rey. } 2. Kg2 Kf8 3. Kf3 *`)
  })
})

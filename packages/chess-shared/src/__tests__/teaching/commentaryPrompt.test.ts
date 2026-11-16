import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { reviewGame, annotateGame, type PlyInput, type Score } from '../../teaching/gameReview.js'
import { buildCommentaryRequest, parseCommentaryResponse } from '../../teaching/commentaryPrompt.js'
import { recognizeGames } from '../../recognition/recognizeGames.js'

function plies(moves: string, evals: Score[], best: Record<number, { san: string; line: string[] }> = {}): PlyInput[] {
  const c = new Chess()
  return moves.split(' ').map((san, i) => {
    const fenBefore = c.fen()
    const m = c.move(san)
    return {
      nodeId: `n${i}`, san: m.san, color: m.color === 'w' ? 'white' : 'black', moveNumber: Math.floor(i / 2) + 1,
      from: m.from, to: m.to, fenBefore, fenAfter: c.fen(), before: evals[i], after: evals[i + 1], best: best[i],
    } as PlyInput
  })
}
const game = plies('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
  [{ cp: 20 }, { cp: 25 }, { cp: 20 }, { cp: -40 }, { cp: -30 }, { cp: -35 }, { mate: 1 }, { mate: 1 }],
  { 5: { san: 'g6', line: ['g6', 'Qf3', 'Nf6'] } })
const review = reviewGame(game)

describe('buildCommentaryRequest', () => {
  const req = buildCommentaryRequest(game, review, { lang: 'es', white: 'Tutor', black: 'Novato' })
  const facts = JSON.parse(req.user.slice(req.user.indexOf('{')))

  it('gives the model every move with the engine verdict and what is on the board', () => {
    expect(facts.players).toEqual({ white: 'Tutor', black: 'Novato' })
    expect(facts.moves).toHaveLength(7)
    const nf6 = facts.moves[5]
    expect(nf6).toMatchObject({ ply: 6, move: '3... Nf6', side: 'black', quality: 'blunder', better: '3... g6 4. Qf3 Nf6' })
    expect(nf6.winChanceBefore).toBeGreaterThan(nf6.winChanceAfter)
    expect(nf6.fen).toBe(game[5].fenAfter)
    const bc4 = facts.moves[4]
    expect(bc4.ideas).toContain('threat: mate on f7')
    expect(bc4.board.attacked.some((p: string) => p.startsWith('black pawn f7'))).toBe(true)
  })
  it('asks for the language and for JSON keyed by ply, and forbids notation inside remarks', () => {
    expect(req.system).toContain('Spanish')
    expect(req.system).toContain('"comments"')
    expect(req.system).toMatch(/never write moves in notation/i)
  })
})

describe('parseCommentaryResponse', () => {
  it('reads the remarks, tolerating code fences, and cleans what would break the reader', () => {
    const raw = '```json\n{"intro":"Una {partida} corta.","comments":[{"ply":6,"text":"Un error (grave):\\nel caballo deja f7."},{"ply":99,"text":"x"},{"ply":2,"text":"  "}]}\n```'
    const parsed = parseCommentaryResponse(raw, game.length)
    expect(parsed.intro).toBe('Una partida corta.')
    expect(parsed.comments).toEqual({ 6: 'Un error grave: el caballo deja f7.' })
  })
  it('says so when the answer is not the expected JSON', () => {
    expect(() => parseCommentaryResponse('Sorry, I cannot.', 7)).toThrow('The model did not return the commentary as JSON.')
  })
})

describe('annotateGame with remarks from a model', () => {
  it('puts each remark on its move and keeps the text readable by the recogniser', () => {
    const text = annotateGame(game, review, {
      level: 2, lang: 'es', white: 'Tutor', black: 'Novato',
      intro: 'Una partida corta y aleccionadora.', remarks: { 6: 'El caballo abandona la defensa de f7.' },
    })
    expect(text).toContain('Una partida corta y aleccionadora.')
    expect(text).toContain('Cf6?? { El caballo abandona la defensa de f7. Era mejor: } (3... g6 4. Df3 Cf6)')
    const [parsed] = recognizeGames(text, { algorithm: 2 })
    expect(parsed.tree.mainline).toHaveLength(7)
    expect(parsed.tree.errors).toEqual([])
  })
})

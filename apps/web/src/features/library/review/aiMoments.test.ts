import { afterEach, describe, expect, it } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import type { LlmRequest } from '../../../shared/llm'
import { commentGameWithAi, momentCommentPrompt, momentFactsText, parseMomentComment, validateMomentComment, MOMENT_COMMENT_SYSTEM } from './aiMoments'
import { momentFacts } from './momentFacts'
import { recommentGame, type CommentOptions } from './recommentGame'
import { setReviewEngine } from './reviewStore'
import { buildPlies, flat } from './testPlies'

const SANS = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+', 'Ke6', 'Nc3', 'Nb4', 'O-O', 'c6']
const TEXT = `Game 1\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 9. O-O c6`
const OPTIONS: CommentOptions = { lang: 'en', level: 2, layout: 'paragraphs', diagrams: undefined, humanComments: false, depth: 4, sfUrl: '' }

/** White's evaluation of the position after k plies of the game. */
const WHITE_CP: Record<number, number> = { 11: 180, 12: 190, 13: 200, 14: 210, 15: 210, 16: 220, 17: 230, 18: 240 }

afterEach(() => setReviewEngine(null))

/** A fake engine: scores by the position's number of moves played (no real engine). */
function fakeEngine(cps: Record<number, number> = WHITE_CP) {
  const plies = buildPlies(SANS, flat(SANS.length, 0))
  const byFen = new Map<string, number>()
  byFen.set(plies[0].fenBefore, 20)
  plies.forEach((p, i) => byFen.set(p.fenAfter, cps[i + 1] ?? 20))
  const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ')
  const table = new Map([...byFen].map(([f, v]) => [key(f), v]))
  setReviewEngine(async (fen) => {
    const white = table.get(key(fen)) ?? 20
    return [{ pv: [], scoreCp: fen.split(' ')[1] === 'w' ? white : -white, depth: 4 } as never]
  })
}

const request = (text: string): LlmRequest => ({ messages: [{ role: 'user', text }] })

describe('the prompt of a key moment (S5)', () => {
  const evals = flat(SANS.length, 30, { 11: { cp: 150 }, 12: { cp: 180 }, 13: { cp: 180 }, 14: { cp: 150 } })
  const plies = buildPlies(SANS, evals)
  plies[10].best = { san: 'Nxf7', line: ['Nxf7', 'Kxf7', 'Qf3+'] }
  const facts = momentFacts(plies, 10)

  it('gives the model the position, the move, the evaluations, the lines, the played continuation and the pattern', () => {
    const { messages } = momentCommentPrompt(facts, { lang: 'es', level: 2 })
    const text = messages[0].text
    expect(text).toContain(facts.fen)
    expect(text).toContain('6.Nxf7')
    expect(text).toContain('+0.3')
    expect(text).toContain('+1.5')
    expect(text).toContain('Nxf7 Kxf7 Qf3+')
    expect(text).toContain('6...Kxf7')
    expect(text).toContain('sacrifice of a minor piece (a knight for a pawn): a knight is offered on f7 and taken at once; net −2 over 4 plies, and the evaluation goes from +0.3 to +1.5: the plan is the attack.')
    expect(text).toContain('Exchange sequence opened by the move (4 plies')
    expect(text).toContain('lead of White 0 → −2')
    expect(text).toContain('White 38, Black 38')
  })

  it('asks for the JSON answer in the chosen language, with its piece letters, short, from the facts only', () => {
    const p = momentCommentPrompt(facts, { lang: 'es', level: 3 })
    expect(p.system).toContain('Spanish')
    expect(p.system).toContain('R (rey), D (dama), T (torre), A (alfil), C (caballo)')
    expect(p.system).toContain('{"comment"')
    expect(p.system).toMatch(/Never invent/)
    expect(p.system).toContain('three sentences')
    expect(p.json).toBeTruthy()
    expect(momentCommentPrompt(facts, { lang: 'de', level: 1 }).system).toContain('one short sentence')
    expect(momentCommentPrompt(facts, { lang: 'fr', level: 2 }).system).toContain('French')
    expect(MOMENT_COMMENT_SYSTEM).toContain('{"comment"')
  })
})

describe('the answer of the model (S5)', () => {
  const plies = buildPlies(SANS, flat(SANS.length, 30, { 11: { cp: 150 }, 12: { cp: 180 }, 13: { cp: 180 }, 14: { cp: 150 } }))
  plies[10].best = { san: 'Nxf7', line: ['Nxf7', 'Kxf7', 'Qf3+'] }
  const facts = momentFacts(plies, 10)

  it('reads {"comment": …}, also inside a code fence', () => {
    expect(parseMomentComment('{"comment": " Bold. "}')).toBe('Bold.')
    expect(parseMomentComment('```json\n{"comment":"Bold."}\n```')).toBe('Bold.')
  })

  it('rejects an answer that is not JSON or has no comment', () => {
    expect(() => parseMomentComment('Bold.')).toThrow()
    expect(() => parseMomentComment('{"comment": "  "}')).toThrow()
    expect(() => parseMomentComment('{"text": "x"}')).toThrow()
  })

  it('accepts the moves of the facts in the letters of the language and the evaluations of the facts', () => {
    expect(validateMomentComment(facts, 'Cxf7 entrega un caballo por un peón, pero la evaluación pasa de +0.3 a +1.5 y sigue Dxf3+.')).toEqual(['move not in the facts: Dxf3+'])
    expect(validateMomentComment(facts, 'Cxf7 entrega un caballo por un peón, pero la evaluación pasa de +0,3 a +1,5; tras Rxf7 llega Df3+.')).toEqual([])
  })

  it('flags a move that is not in the facts', () => {
    expect(validateMomentComment(facts, 'The knight goes to Nxh8 at once.')).toEqual(['move not in the facts: Nxh8'])
  })

  it('flags an evaluation that is not in the facts', () => {
    expect(validateMomentComment(facts, 'Nxf7 raises the evaluation to +4.5.')).toEqual(['evaluation not in the facts: +4.5'])
  })

  it('flags an empty or long answer', () => {
    expect(validateMomentComment(facts, '')).toEqual(['the comment is empty'])
    expect(validateMomentComment(facts, 'Nxf7 is bold. '.repeat(60))[0]).toMatch(/too long/)
  })

  it('does not take the square of a move for an invention', () => {
    expect(validateMomentComment(facts, 'Nxf7 attacks the king, the f7 pawn falls and Kxf7 is forced.')).toEqual([])
  })
})

describe('commentGameWithAi (S5)', () => {
  const sacrificeAnswer = (r: LlmRequest) => r.messages[0].text.includes('6.Nxf7')
    ? { text: '{"comment": "Nxf7 gives a knight for a pawn, but the attack on the king makes up for it."}', model: 'fake' }
    : { text: '{"comment": "A strong move."}', model: 'fake' }

  it('puts the AI comment on the key moments, using the engine plumbing and the facts', async () => {
    fakeEngine()
    const requests: LlmRequest[] = []
    const body = await commentGameWithAi({
      games: recognizeGames(TEXT), gameIndex: 0, text: TEXT, options: OPTIONS,
      complete: async (r) => { requests.push(r); return sacrificeAnswer(r) },
    })
    expect(body).toContain('Nxf7 gives a knight for a pawn, but the attack on the king makes up for it.')
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every((r) => r.json)).toBe(true)
    const sac = requests.find((r) => r.messages[0].text.includes('6.Nxf7'))!
    expect(sac.messages[0].text).toContain('sacrifice of a minor piece (a knight for a pawn)')
    // the layout of the existing flow: the moves are still written
    expect(body).toContain('6. Nxf7')
  })

  it('keeps the template remark when the model fails or answers something flagged', async () => {
    fakeEngine()
    const template = await recommentGame(recognizeGames(TEXT), 0, TEXT, OPTIONS)
    const failing = await commentGameWithAi({
      games: recognizeGames(TEXT), gameIndex: 0, text: TEXT, options: OPTIONS,
      complete: async () => { throw new Error('offline') },
    })
    expect(failing).toBe(template)
    const flagged = await commentGameWithAi({
      games: recognizeGames(TEXT), gameIndex: 0, text: TEXT, options: OPTIONS,
      complete: async () => ({ text: '{"comment": "Nxh8 wins at once, +9.9."}', model: 'fake' }),
    })
    expect(flagged).toBe(template)
    const garbage = await commentGameWithAi({
      games: recognizeGames(TEXT), gameIndex: 0, text: TEXT, options: OPTIONS,
      complete: async () => ({ text: 'no json', model: 'fake' }),
    })
    expect(garbage).toBe(template)
  })

  it('reports progress up to the end and stops when aborted', async () => {
    fakeEngine()
    const steps: Array<[number, number]> = []
    await commentGameWithAi({
      games: recognizeGames(TEXT), gameIndex: 0, text: TEXT, options: OPTIONS, complete: async (r) => sacrificeAnswer(r),
      onProgress: (d, t) => steps.push([d, t]),
    })
    const last = steps.at(-1)!
    expect(last[0]).toBe(last[1])
    expect(last[1]).toBeGreaterThan(SANS.length + 1)
    const controller = new AbortController()
    controller.abort()
    await expect(commentGameWithAi({
      games: recognizeGames(TEXT), gameIndex: 0, text: TEXT, options: OPTIONS, complete: async (r) => sacrificeAnswer(r), signal: controller.signal,
    })).rejects.toThrow('aborted')
  })

  it('stops between two moments when the signal aborts during the AI step', async () => {
    fakeEngine()
    const controller = new AbortController()
    await expect(commentGameWithAi({
      games: recognizeGames(TEXT), gameIndex: 0, text: TEXT, options: OPTIONS, signal: controller.signal,
      complete: async () => { controller.abort(); throw new Error('cancelled') },
    })).rejects.toThrow('aborted')
  })

  it('does not change the existing flow: recommentGame gives the same text with and without the AI module in play', async () => {
    fakeEngine()
    const a = await recommentGame(recognizeGames(TEXT), 0, TEXT, OPTIONS)
    const b = await recommentGame(recognizeGames(TEXT), 0, TEXT, OPTIONS)
    expect(a).toBe(b)
    expect(request('x').messages).toHaveLength(1)
    expect(momentFactsText).toBeTypeOf('function')
  })
})

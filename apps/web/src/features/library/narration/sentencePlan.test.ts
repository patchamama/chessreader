import { describe, expect, it } from 'vitest'
import { planSentence } from './sentencePlan'

const SPANISH_B = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3'
// 1.e4 e5 2.Nf3 d6 with Black's bishop free to leave: the f5 comment of the sample course.
const D6 = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 3'
const F5 = 'Despejando la diagonal de nuestro alfil de casillas blancas y preparando el avance f5!'

const squares = (cues: { squares: { square: string; role: string }[] }[]) => cues.flatMap((c) => c.squares.map((s) => `${s.role}:${s.square}`))

describe('planSentence: what the board shows while a sentence is narrated (S5, S6)', () => {
  it('without actions, the moves written in the sentence appear as the narrator reaches them', () => {
    const text = 'Ahora continuamos con Cge7, buscando un posible Cg6 controlando la casilla f4.'
    const plan = planSentence({ sentences: [text], index: 0, fen: SPANISH_B, baseCues: [] })
    expect(plan.reveals.map((r) => r.at)).toEqual([3, 7])
    expect(squares(plan.reveals[0].cues)).toEqual(['from:g8', 'to:e7'])
    expect(squares(plan.reveals[1].cues)).toEqual(['mention:e7', 'mention:g6'])
  })

  it('keeps the cues the comment analysis already made as the starting board', () => {
    const base = [{ kind: 'square' as const, label: 'x', squares: [{ square: 'f4', role: 'mention' as const }], arrows: [], start: 0, end: 0 }]
    expect(planSentence({ sentences: ['Sin jugadas.'], index: 0, fen: SPANISH_B, baseCues: base }).base).toEqual(base)
  })

  it('with actions, they replace the guesses: the diagonal first, the arrow when f5! is reached', () => {
    const plan = planSentence({ sentences: [F5], index: 0, fen: D6, baseCues: [], actions: '0Diagonal:c8-h3, 13Arrow:f7-f5' })
    expect(squares(plan.base)).toEqual(['line:c8', 'line:d7', 'line:e6', 'line:f5', 'line:g4', 'line:h3'])
    expect(plan.reveals).toHaveLength(1)
    expect(plan.reveals[0].at).toBe(13)
    expect(plan.reveals[0].cues[0].arrows).toEqual([{ from: 'f7', to: 'f5', role: 'to' }])
  })

  it('counts the words of a comment across its sentences', () => {
    const second = 'Y preparando el avance f5!'
    const first = 'Despejando la diagonal.'
    // word 3 is the first of the second sentence ("Y"); word 7 = "f5!"
    const plan = planSentence({ sentences: [first, second], index: 1, fen: D6, baseCues: [], actions: '0Diagonal:c8-h3, 6Arrow:f7-f5' })
    expect(squares(plan.base)).toEqual(['line:c8', 'line:d7', 'line:e6', 'line:f5', 'line:g4', 'line:h3'])
    expect(plan.reveals.map((r) => r.at)).toEqual([3])
  })

  it('discards invalid actions and falls back to nothing when none is valid', () => {
    const plan = planSentence({ sentences: [F5], index: 0, fen: D6, baseCues: [], actions: '0Diagonal:c8-h4, 99Arrow:f7-f5' })
    expect(plan.base).toEqual([])
    expect(plan.reveals).toEqual([])
  })

  it('has no moves to read on an unreadable position', () => {
    expect(planSentence({ sentences: ['con Aa4'], index: 0, fen: null, baseCues: [] })).toEqual({ base: [], reveals: [] })
  })
})

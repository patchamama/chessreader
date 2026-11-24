import { describe, expect, it } from 'vitest'
import { describeEnding, describePattern, materialByPly, materialOf, momentFacts, moverCp, moverScoreText } from './momentFacts'
import { buildPlies, flat } from './testPlies'

const FRIED_LIVER = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7', 'Kxf7', 'Qf3+', 'Ke6', 'Nc3', 'Nb4', 'O-O', 'c6']
const SAC_INDEX = 10

describe('material of each side (S5)', () => {
  it('counts P1 N3 B3 R5 Q9 and leaves the kings out', () => {
    expect(materialOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toEqual({ white: 39, black: 39 })
    expect(materialOf('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toEqual({ white: 0, black: 0 })
  })

  it('records captures, the balance and the mover gain of every ply', () => {
    const plies = buildPlies(['e4', 'd5', 'exd5', 'Qxd5'], flat(4, 0))
    const m = materialByPly(plies)
    expect(m.map((x) => x.balance)).toEqual([0, 0, 1, 0])
    expect(m[2]).toMatchObject({ captured: 'p', moverGain: 1, color: 'white' })
    expect(m[3]).toMatchObject({ captured: 'p', moverGain: 1, color: 'black' })
    expect(m[0].captured).toBeUndefined()
    expect(m[2].after).toEqual({ white: 39, black: 38 })
  })

  it('records a promotion as material gained', () => {
    const plies = buildPlies(['a8=Q', 'Kg6'], flat(2, 0), '8/P6k/8/8/8/8/8/K7 w - - 0 1')
    const m = materialByPly(plies)
    expect(m[0]).toMatchObject({ promotion: 'q', moverGain: 8 })
  })
})

describe('scores as the mover sees them', () => {
  it('flips the sign for Black and words the mates', () => {
    expect(moverCp({ cp: 150 }, 'black')).toBe(-150)
    expect(moverScoreText({ cp: 180 }, 'white')).toBe('+1.8')
    expect(moverScoreText({ cp: 30 }, 'black')).toBe('−0.3')
    expect(moverScoreText({ mate: 3 }, 'white')).toBe('mate in 3')
    expect(moverScoreText({ mate: 2 }, 'black')).toBe('being mated in 2')
    expect(moverCp({ mate: -1 }, 'black')).toBe(10000)
  })
})

describe('sacrifices (S5)', () => {
  const evals = flat(FRIED_LIVER.length, 30, { 11: { cp: 150 }, 12: { cp: 180 }, 13: { cp: 180 }, 14: { cp: 150 } })
  const plies = buildPlies(FRIED_LIVER, evals)

  it('detects a knight given for a pawn when the evaluation rises, and what it buys', () => {
    const f = momentFacts(plies, SAC_INDEX)
    expect(f.patterns[0]).toMatchObject({ kind: 'sacrifice', amount: 2, gave: ['n'], took: ['p'], buys: 'attack', evalBefore: '+0.3', evalAfter: '+1.5' })
    expect(describePattern(f.patterns[0])).toBe('sacrifice of a minor piece (a knight for a pawn): a knight is offered on f7 and taken at once; net −2 over 4 plies, and the evaluation goes from +0.3 to +1.5: the plan is the attack. Forced replies: 7...Ke6 (the answer to a check).')
    expect(f.leadBefore).toBe(0)
    expect(f.played[0]).toMatchObject({ label: '6.Nxf7', captured: 'p', lead: 1 })
    expect(f.played[1]).toMatchObject({ label: '6...Kxf7', captured: 'n', lead: -2 })
  })

  it('is a sacrifice for a mate when the evaluation after it is a mate for the mover', () => {
    const mate = flat(FRIED_LIVER.length, 30, { 11: { mate: 4 }, 12: { mate: 3 }, 13: { mate: 3 }, 14: { mate: 2 } })
    const f = momentFacts(buildPlies(FRIED_LIVER, mate), SAC_INDEX)
    expect(f.patterns.map((p) => p.kind)).toEqual(['sacrifice', 'mating-attack'])
    expect(f.patterns[0]).toMatchObject({ buys: 'mate' })
    expect(f.patterns[1]).toEqual({ kind: 'mating-attack', mateIn: 4 })
  })

  it('has a positional price when nothing follows (a group of the move and the reply, no gain)', () => {
    const calm = flat(FRIED_LIVER.length, 30, { 11: { cp: 40 } })
    const f = momentFacts(buildPlies(FRIED_LIVER, calm), SAC_INDEX, { horizon: 2 })
    expect(f.patterns[0]).toMatchObject({ kind: 'sacrifice', buys: 'positional' })
  })

  it('is not a sacrifice when the evaluation falls: it is a hanging blunder', () => {
    const bad = flat(FRIED_LIVER.length, 30, { 11: { cp: -250 }, 12: { cp: -250 }, 13: { cp: -250 }, 14: { cp: -250 } })
    const f = momentFacts(buildPlies(FRIED_LIVER, bad), SAC_INDEX)
    expect(f.patterns.map((p) => p.kind)).toEqual(['blunder-hanging'])
    expect(f.patterns[0]).toMatchObject({ amount: 2, gave: ['n'], evalBefore: '+0.3', evalAfter: '−2.5' })
  })

  it('buys material when the piece comes back soon after (a fork)', () => {
    const fen = '4k3/5p1r/8/8/2B5/5N2/8/4K3 w - - 0 1'
    const plies = buildPlies(['Bxf7+', 'Kxf7', 'Ng5+', 'Ke7', 'Nxh7'], flat(5, 0, { 1: { cp: 20 }, 2: { cp: 20 }, 3: { cp: 300 }, 4: { cp: 300 }, 5: { cp: 320 } }), fen)
    const f = momentFacts(plies, 0)
    expect(f.patterns[0]).toMatchObject({ kind: 'sacrifice', amount: 2, gave: ['b'], took: ['p', 'r'], buys: 'material' })
    expect(f.ending).toEqual({ kind: 'material-won', amount: 3 })
  })

  it('does not call an even exchange a sacrifice', () => {
    const plies = buildPlies(['e4', 'd5', 'exd5', 'Qxd5'], flat(4, 0))
    expect(momentFacts(plies, 2).patterns).toEqual([])
  })
})

describe('other patterns (S5)', () => {
  it('flags a piece hung with an evaluation drop as blunder-hanging', () => {
    const plies = buildPlies(['e4', 'e5', 'Qh5', 'Nc6', 'Qxe5', 'Nxe5'], flat(6, 30, { 5: { cp: -850 }, 6: { cp: -850 } }))
    const f = momentFacts(plies, 4)
    expect(f.patterns[0]).toMatchObject({ kind: 'blunder-hanging', amount: 8, gave: ['q'] })
    expect(describePattern(f.patterns[0])).toContain('loses material (net −8, giving a queen)')
  })

  it('flags a winning capture sequence with the material won', () => {
    const fen = '4k3/8/8/1n1b4/8/8/8/3RK3 w - - 0 1'
    const plies = buildPlies(['Rxd5', 'Ke7', 'Rxb5'], flat(3, 0, { 1: { cp: 300 }, 2: { cp: 300 }, 3: { cp: 600 } }), fen)
    const f = momentFacts(plies, 0)
    expect(f.patterns).toEqual([{ kind: 'winning-capture-sequence', amount: 6, captures: 2 }])
    expect(f.ending).toEqual({ kind: 'material-won', amount: 6 })
    expect(describePattern(f.patterns[0])).toBe('winning capture sequence: 2 captures in a row leave the mover 6 points of material up.')
  })

  it('flags a mating attack and an ending in mate', () => {
    const plies = buildPlies(['f3', 'e5', 'g4', 'Qh4#'], flat(4, 0, { 3: { cp: -500 }, 4: { mate: -1 } }))
    const f = momentFacts(plies, 3)
    expect(f.patterns).toEqual([{ kind: 'mating-attack', mateIn: 1 }])
    expect(f.ending).toEqual({ kind: 'mate', by: 'black' })
    expect(describeEnding(f.ending)).toBe('the continuation ends in checkmate by black')
  })

  it('reports a mate coming a few plies after the key move', () => {
    const plies = buildPlies(['f3', 'e5', 'g4', 'Qh4#'], flat(4, 0))
    expect(momentFacts(plies, 1, { horizon: 4 }).ending).toEqual({ kind: 'mate', by: 'black' })
  })

  it('reports a promotion in the continuation', () => {
    const plies = buildPlies(['a8=Q', 'Kg6'], flat(2, 0), '8/P6k/8/8/8/8/8/K7 w - - 0 1')
    expect(momentFacts(plies, 0).ending).toEqual({ kind: 'promotion', by: 'white' })
  })

  it('reports a quiet continuation and keeps the engine lines', () => {
    const plies = buildPlies(['e4', 'e5', 'Nf3'], flat(3, 20))
    plies[2].best = { san: 'Nf3', line: ['Nf3', 'Nc6'] }
    plies[2].second = { san: 'Bc4', line: ['Bc4'], score: { cp: 10 } }
    const f = momentFacts(plies, 2)
    expect(f.ending).toEqual({ kind: 'quiet' })
    expect(f.patterns).toEqual([])
    expect(f.best?.line).toEqual(['Nf3', 'Nc6'])
    expect(f.second?.san).toBe('Bc4')
    expect(f.fen).toBe(plies[2].fenBefore)
    expect(f.played).toHaveLength(1)
    expect(f.materialBefore).toEqual({ white: 39, black: 39 })
  })

  it('works from the Black side of the board', () => {
    const plies = buildPlies(['e4', 'd5', 'exd5', 'Qxd5'], flat(4, 0))
    const f = momentFacts(plies, 3)
    expect(f.color).toBe('black')
    expect(f.leadBefore).toBe(-1)
    expect(f.played[0].lead).toBe(0)
  })
})

describe('a sacrifice is read over the group of moves, not over one move (S5)', () => {
  it('measures the whole exchange: start material and evaluation against the end, where the captures stop', () => {
    const evals = flat(FRIED_LIVER.length, 30, { 11: { cp: 150 }, 12: { cp: 180 }, 13: { cp: 180 }, 14: { cp: 180 } })
    const f = momentFacts(buildPlies(FRIED_LIVER, evals), SAC_INDEX)
    // Nxf7 Kxf7 Qf3+ Ke6 and then two quiet plies: the group stops there
    expect(f.group).toMatchObject({ plies: 4, leadStart: 0, leadEnd: -2, evalStartText: '+0.3', evalEndText: '+1.8' })
    expect(f.patterns[0]).toMatchObject({ kind: 'sacrifice', amount: 2, gave: ['n'], took: ['p'], buys: 'attack', evalBefore: '+0.3', evalAfter: '+1.8', exchange: 'minor' })
  })

  it('does not take a trade for a sacrifice even when the middle of it is behind', () => {
    // 1.Nxe5 Nxe5 2.Bxe5 : the mover is a knight down for one ply, and takes it back at once
    const fen = '4k3/5n2/8/4p3/8/5N2/1B6/4K3 w - - 0 1'
    const f = momentFacts(buildPlies(['Nxe5', 'Nxe5', 'Bxe5'], flat(3, 0), fen), 0)
    expect(f.patterns.filter((p) => p.kind === 'sacrifice')).toEqual([])
  })

  it('sees the piece given away: the move goes "to the slaughter" and is taken at once, even when the move itself is quiet', () => {
    const fen = '4k3/8/8/4p3/8/8/8/3QK3 w - - 0 1'
    const evals = flat(6, 0, { 1: { cp: 0 }, 2: { cp: 400 }, 3: { cp: 600 }, 4: { cp: 600 }, 5: { cp: 600 }, 6: { cp: 600 } })
    const f = momentFacts(buildPlies(['Qd4', 'exd4', 'Kd2', 'Kd7', 'Ke2', 'Ke7'], evals, fen), 0)
    expect(f.patterns[0]).toMatchObject({ kind: 'sacrifice', gave: ['q'], took: [], exchange: 'queen', offered: { piece: 'q', square: 'd4' } })
    expect(describePattern(f.patterns[0])).toContain('a queen is offered on d4 and taken at once')
  })

  it('names the exchange sacrifice: a rook given for a minor piece', () => {
    const fen = '4k3/8/3p4/2b5/8/8/8/2R1K3 w - - 0 1'
    const evals = flat(6, 0, { 3: { cp: 150 }, 4: { cp: 150 }, 5: { cp: 150 }, 6: { cp: 150 } })
    const f = momentFacts(buildPlies(['Rxc5', 'dxc5', 'Ke2', 'Kd7', 'Kd3', 'Kc6'], evals, fen), 0)
    expect(f.patterns[0]).toMatchObject({ kind: 'sacrifice', amount: 2, gave: ['r'], took: ['b'], exchange: 'exchange' })
    expect(describePattern(f.patterns[0])).toContain('sacrifice of the exchange (a rook for a bishop)')
  })

  it('names a queen sacrifice', () => {
    const fen = '4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1'
    const evals = flat(6, 0, { 3: { cp: 200 }, 4: { cp: 200 }, 5: { cp: 200 }, 6: { cp: 200 } })
    const f = momentFacts(buildPlies(['Qxd5', 'exd5', 'Kd2', 'Kd7', 'Kc3', 'Kc6'], evals, fen), 0)
    expect(f.patterns[0]).toMatchObject({ kind: 'sacrifice', gave: ['q'], took: ['p'], exchange: 'queen' })
  })

  it('marks the forced replies of the group: the only legal move, and the answer to a check', () => {
    const fen = '7k/8/6K1/8/8/8/8/R7 w - - 0 1'
    const f = momentFacts(buildPlies(['Rh1+', 'Kg8', 'Rh2'], flat(3, 0), fen), 0)
    expect(f.played.map((s) => s.forced)).toEqual([undefined, 'only-move'])
  })

  it('marks a quiet move that gives up a lot with few moves to choose from as a possible zugzwang', () => {
    // Black to move with king and pawn against king and pawn: both king moves lose (the opposition)
    const fen = '5k2/8/5K2/5P2/8/8/8/8 b - - 0 1'
    const f = momentFacts(buildPlies(['Ke8', 'Ke6'], flat(2, 0, { 1: { cp: 500 }, 2: { cp: 500 } }), fen), 0)
    expect(f.played[0].forced).toBe('zugzwang')
  })

  it('recovers: material given in the middle of the group and taken back later is a sacrifice that is paid back', () => {
    const fen = '4k3/5p1r/8/8/2B5/5N2/8/4K3 w - - 0 1'
    const plies = buildPlies(['Bxf7+', 'Kxf7', 'Ng5+', 'Ke7', 'Nxh7'], flat(5, 0, { 1: { cp: 20 }, 2: { cp: 20 }, 3: { cp: 300 }, 4: { cp: 300 }, 5: { cp: 320 } }), fen)
    const f = momentFacts(plies, 0)
    expect(f.patterns[0]).toMatchObject({ kind: 'sacrifice', amount: 2, gave: ['b'], took: ['p', 'r'], buys: 'material', recovered: true })
  })

  it('a long exchange ending behind with a falling evaluation is a blunder, not a sacrifice', () => {
    const plies = buildPlies(['e4', 'e5', 'Qh5', 'Nc6', 'Qxe5', 'Nxe5'], flat(6, 30, { 5: { cp: -850 }, 6: { cp: -850 } }))
    expect(momentFacts(plies, 4).patterns.map((p) => p.kind)).toEqual(['blunder-hanging'])
  })
})

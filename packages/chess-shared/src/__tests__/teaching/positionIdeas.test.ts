import { describe, it, expect } from 'vitest'
import { positionIdeas } from '../../teaching/positionIdeas.js'
import { moveMotifs } from '../../teaching/gameReview.js'

const kinds = (fen: string, san: string) => moveMotifs(fen, san).map((m) => m.kind)

describe('positionIdeas', () => {
  it('finds pieces that are attacked and not defended, and pieces nobody defends', () => {
    // White knight e5 attacked by the pawn d6, undefended; black rook a8 is loose.
    const ideas = positionIdeas('r3k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1')
    expect(ideas.hanging).toEqual([{ square: 'e5', piece: 'n', color: 'white', attackers: ['d6'] }])
    expect(ideas.loose.map((p) => p.square)).toEqual(['a8'])
  })
  it('a piece attacked by something cheaper counts as hanging even when defended', () => {
    const ideas = positionIdeas('4k3/8/3p4/4R3/3P4/8/8/4K3 w - - 0 1')
    expect(ideas.hanging.map((p) => p.square)).toEqual(['e5'])
  })
  it('finds outposts: a knight no enemy pawn can ever chase, held by a pawn', () => {
    const ideas = positionIdeas('4k3/pp3ppp/8/3N4/4P3/8/PP3PPP/4K3 w - - 0 1')
    expect(ideas.outposts).toEqual([{ square: 'd5', piece: 'n', color: 'white' }])
    // With a black pawn on c7 the knight can be chased by ...c6.
    expect(positionIdeas('4k3/ppp2ppp/8/3N4/4P3/8/PP3PPP/4K3 w - - 0 1').outposts).toEqual([])
  })
  it('reads the pawn structure and the files', () => {
    const ideas = positionIdeas('4k3/p4ppp/8/3P4/8/8/P1P3PP/4K3 w - - 0 1')
    expect(ideas.passedPawns.filter((p) => p.color === 'white').map((p) => p.square)).toEqual(['c2', 'd5'])
    expect(ideas.isolatedPawns.filter((p) => p.color === 'white').map((p) => p.square)).toEqual(['a2'])
    expect(ideas.openFiles).toEqual(['b', 'e'])
  })
  it('finds pieces pinned to their king', () => {
    const ideas = positionIdeas('4k3/8/2n5/1B6/8/8/8/4K3 b - - 0 1')
    expect(ideas.pinned).toEqual([{ square: 'c6', piece: 'n', color: 'black', by: 'b5' }])
  })
  it('counts attackers and defenders of every piece', () => {
    const ideas = positionIdeas('4k3/8/3p4/4R3/3P4/8/8/4K3 w - - 0 1')
    expect(ideas.pieces.find((p) => p.square === 'e5')).toMatchObject({ attackers: ['d6'], defenders: ['d4'] })
  })
})

describe('moveMotifs, ideas a move creates', () => {
  it('a move that attacks an undefended piece is a threat', () => {
    expect(kinds('r3k3/8/8/8/8/8/8/3QK3 w - - 0 1', 'Qd5')).toContain('attack-undefended')
  })
  it('taking an undefended piece wins material', () => {
    expect(kinds('r3k3/8/8/3Q4/8/8/8/4K3 w - - 0 1', 'Qxa8+')).toContain('wins-material')
  })
  it('a piece stepping aside uncovers an attack on a more valuable piece', () => {
    // Bishop moves off the d-file: the rook d1 now attacks the queen d8.
    expect(kinds('3qk3/8/8/8/8/3B4/8/3RK3 w - - 0 1', 'Bb5+')).toContain('discovered-attack')
  })
  it('a knight that lands on an outpost, a rook that takes an open file, a pawn that becomes passed', () => {
    expect(kinds('4k3/pp3ppp/8/8/4P3/2N5/PP3PPP/4K3 w - - 0 1', 'Nd5')).toContain('outpost')
    expect(kinds('4k3/ppp2ppp/8/8/8/8/PPP2PPP/R3K3 w - - 0 1', 'Rd1')).toContain('open-file')
    expect(kinds('4k3/p5pp/8/3Pp3/8/8/P5PP/4K3 w - e6 0 1', 'd6')).toContain('passed-pawn')
  })
  it('two heavy pieces lined up on a file are a battery; a slider behind an enemy piece is an x-ray', () => {
    expect(kinds('3rk3/8/8/8/8/8/3R4/Q3K3 w - - 0 1', 'Qd1')).toContain('battery')
    // Rook e1 looks through the black knight e5 at the king e8.
    expect(kinds('4k3/8/8/4n3/8/8/8/R3K3 w - - 0 1', 'Re1')).not.toContain('x-ray') // own king blocks: nothing
    expect(kinds('4k3/8/8/4n3/8/8/8/R5K1 w - - 0 1', 'Re1')).toContain('pin')
    expect(kinds('3r2k1/3q4/8/8/8/8/8/R3K3 w - - 0 1', 'Rd1')).toContain('x-ray')
  })
  it('a move that leaves an own piece hanging is flagged', () => {
    expect(kinds('4k3/8/3p4/4N3/8/5P2/8/4K3 w - - 0 1', 'f4')).not.toContain('leaves-hanging')
    expect(kinds('4k3/8/3p4/4N3/5P2/8/8/4K3 w - - 0 1', 'f5')).toContain('leaves-hanging')
  })
})

describe('patterns learnt from annotated games', () => {
  const find = (fen: string, san: string, kind: string) => moveMotifs(fen, san).filter((m) => m.kind === kind)

  it('"threatens mate": the mover would mate if it could move again', () => {
    // After Qh5 White threatens Qxf7#.
    const [t] = find('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1', 'Qh5', 'threat')
    expect(t.data).toMatchObject({ type: 'mate' })
    expect(t.squares).toEqual(['f7'])
  })
  it('"threatens to win a piece": a capture that was not there before', () => {
    const t = find('r3k3/8/8/8/8/8/8/3QK3 w - - 0 1', 'Qd5', 'threat').find((x) => x.data?.type === 'capture')!
    expect(t.data).toMatchObject({ type: 'capture', piece: 'r' })
    expect(t.squares).toEqual(['a8'])
  })
  it('"threatens a fork": the next move would attack two pieces at once', () => {
    // Nd5 threatens Nc7+ forking king and rook.
    const t = find('r3k3/8/8/8/8/2N5/8/4K3 w - - 0 1', 'Nd5', 'threat')
    expect(t.some((x) => x.data?.type === 'fork' && x.squares[0] === 'c7')).toBe(true)
  })
  it('no threat is reported when the opponent is in check or nothing is new', () => {
    expect(find('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4', 'threat')).toEqual([])
  })
  it('"winning a pawn": a pawn taken for nothing counts as material won', () => {
    expect(find('4k3/8/8/5p2/8/8/8/3QK3 w - - 0 1', 'Qd5', 'wins-material')).toEqual([])
    expect(find('4k3/8/8/3Q1p2/8/8/8/4K3 w - - 0 1', 'Qxf5', 'wins-material')[0].data).toMatchObject({ piece: 'p' })
    // A pawn exchange is not a win: the pawn is taken back.
    expect(find('4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1', 'exd5', 'wins-material')).toEqual([])
  })
  it('"a pawn fork": a protected pawn attacking two pieces', () => {
    const [f] = find('4k3/8/3n1b2/8/3PP3/8/8/4K3 w - - 0 1', 'e5', 'fork')
    expect(f.squares).toEqual(['d6', 'f6'])
  })
  it('"sacrifices a pawn": a pawn pushed where it can simply be taken', () => {
    expect(find('4k3/7p/8/8/6P1/8/8/4K3 w - - 0 1', 'g5', 'pawn-sacrifice')).toEqual([])
    expect(find('4k3/8/7p/8/6P1/8/8/4K3 w - - 0 1', 'g5', 'pawn-sacrifice')).toHaveLength(1)
  })
  it('"prepares to castle": the last piece between king and rook leaves', () => {
    expect(find('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1', 'Bc4', 'prepares-castling')).toHaveLength(1)
    expect(find('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', 'Nf3', 'prepares-castling')).toEqual([])
  })
  it('"opens the file": a capture that leaves the mover a file without own pawns', () => {
    const [o] = find('4k3/6p1/8/8/8/6p1/7P/4K2R w K - 0 1', 'hxg3', 'open-file')
    expect(o.data).toMatchObject({ file: 'h' })
  })
})

describe('motifText for the new ideas', () => {
  it('says each idea in the three languages without writing a move', async () => {
    const { motifText } = await import('../../teaching/gameReview.js')
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1'
    const [t] = moveMotifs(fen, 'Qh5').filter((m) => m.kind === 'threat')
    const after = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 1 1'
    expect(motifText(t, after, 'es')).toBe('Amenaza mate en f7.')
    expect(motifText(t, after, 'en')).toBe('Threatens mate on f7.')
    expect(motifText(t, after, 'de')).toBe('Droht Matt auf f7.')
    const hang = { kind: 'attack-undefended' as const, square: 'h5', squares: ['e5'] }
    expect(motifText(hang, after, 'es')).toBe('La dama ataca el peón de e5, que nadie defiende.')
  })
})

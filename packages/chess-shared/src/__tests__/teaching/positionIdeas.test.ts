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
    expect(kinds('3r2k1/3q4/8/8/8/8/8/R5K1 w - - 0 1', 'Rd1')).toContain('x-ray')
  })
  it('a move that leaves an own piece hanging is flagged', () => {
    expect(kinds('4k3/8/3p4/4N3/8/5P2/8/4K3 w - - 0 1', 'f4')).not.toContain('leaves-hanging')
    expect(kinds('4k3/8/3p4/4N3/5P2/8/8/4K3 w - - 0 1', 'f5')).toContain('leaves-hanging')
  })
})

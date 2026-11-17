import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { moveMotifs, reviewGame, type PlyInput } from '../../teaching/gameReview.js'

const kinds = (fen: string, san: string, prev?: string) => moveMotifs(fen, san, prev ? { prevFen: prev } : undefined).map((m) => m.kind)

function plies(moves: string): PlyInput[] {
  const c = new Chess()
  return moves.split(' ').map((san, i) => {
    const fenBefore = c.fen()
    const m = c.move(san)
    return {
      nodeId: `n${i}`, san: m.san, from: m.from, to: m.to, fenBefore, fenAfter: c.fen(),
      color: m.color === 'w' ? 'white' : 'black', moveNumber: Math.floor(i / 2) + 1,
      before: { cp: 0 }, after: { cp: 0 },
    } as PlyInput
  })
}

describe('remarks that would be wrong', () => {
  it('a piece that is simply lost next move neither pins nor threatens (S11)', () => {
    // Black rook takes on e4; the white queen on d4 takes it back for free.
    const ks = kinds('4r1k1/8/8/8/3QR3/8/P3B2P/4K3 b - - 0 1', 'Rxe4')
    expect(ks).not.toContain('pin')
    expect(ks).not.toContain('threat')
    expect(ks).not.toContain('attack-undefended')
    expect(ks).not.toContain('wins-material')
  })

  it('taking back what was just taken is not winning material (S13)', () => {
    const review = reviewGame(plies('e4 d5 exd5 Qxd5'))
    expect(review.moves[3].motifs.map((m) => m.kind)).not.toContain('wins-material')
  })

  it('a free piece is still winning material', () => {
    expect(kinds('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', 'Qxd5+')).toContain('wins-material')
  })

  it('no battery when the line points at nothing (S14)', () => {
    expect(kinds('4k3/8/8/8/8/8/8/R2QK3 w - - 0 1', 'Qb1')).not.toContain('battery')
  })

  it('a battery that aims at an enemy piece along an open file is one', () => {
    expect(kinds('3r2k1/5ppp/8/8/8/8/R4PPP/3Q2K1 w - - 0 1', 'Rd2')).toContain('battery')
  })

  it('no "file open for the rooks" when the side has no rook (S15)', () => {
    expect(kinds('4k3/8/8/3p4/4P3/8/8/6K1 w - - 0 1', 'exd5')).not.toContain('open-file')
    expect(kinds('4k3/8/8/3p4/4P3/8/8/R5K1 w - - 0 1', 'exd5')).toContain('open-file')
  })
})

describe('lined-up pieces name their line (S8, S14)', () => {
  it('says which file the pieces share and what they aim at, so the board lights the whole file', async () => {
    const { motifText, analyseComment } = await import('../../index.js')
    const fen = '3r2k1/5ppp/8/8/8/8/R4PPP/3Q2K1 w - - 0 1'
    const m = moveMotifs(fen, 'Rd2').find((x) => x.kind === 'battery')!
    const c = new Chess(fen); c.move('Rd2')
    const es = motifText(m, c.fen(), 'es')
    expect(es).toBe('La torre y la dama de d1 se alinean en la columna d contra la torre de d8.')
    expect(es).not.toMatch(/bater/i)
    const line = analyseComment(es, c.fen()).find((q) => q.kind === 'line')!
    expect(line.squares.map((s) => s.square)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'])
    expect(motifText(m, c.fen(), 'en')).toBe('The rook and the queen on d1 line up on the d-file against the rook on d8.')
  })
})

describe('remarks the audit found wrong (S26)', () => {
  it('a piece attacking from a square where a cheaper piece takes it attacks nothing', () => {
    // 27. Nec5: the knight on c5 can be taken by the pawn on b6.
    expect(kinds('r7/p1p1npk1/bp4p1/8/2P1N3/1P1N4/P1P2P1P/2K1R3 w - - 6 27', 'Nec5')).not.toContain('attack-undefended')
  })
  it('no "trapped" when the attacker itself can be taken', () => {
    // 5. Nxc6: the queen on d8 has no move, but b7xc6 / d7xc6 removes the knight.
    expect(kinds('r1bqkb1r/pppp1ppp/2n2n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5', 'Nxc6')).not.toContain('traps')
  })
  it('no "wins material" when the reply takes back as much elsewhere', () => {
    // White Bxb7 takes a free pawn while its own queen on d1 hangs to the bishop on g4.
    expect(kinds('rn1qkbnr/pppppppp/8/8/6b1/8/PPPP1PBP/RNBQK1NR w KQkq - 0 1', 'Bxb7')).not.toContain('wins-material')
  })
})

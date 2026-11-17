import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { motifText, reviewGame, spokenMotifs, type PlyInput } from '../../teaching/gameReview.js'

function plies(moves: string): PlyInput[] {
  const c = new Chess()
  return moves.split(' ').map((san, i) => {
    const fenBefore = c.fen()
    const m = c.move(san)
    return {
      nodeId: `n${i}`, san: m.san, from: m.from, to: m.to, fenBefore, fenAfter: c.fen(),
      color: m.color === 'w' ? 'white' : 'black', moveNumber: Math.floor(i / 2) + 1,
      before: { cp: 20 }, after: { cp: 20 },
    } as PlyInput
  })
}

// The user's game: 1. e4 e5 2. Cf3 Cc6 3. Ab5 Cf6 4. O-O Cxe4 5. Te1 Cd6 (6. Cxe5 …)
const p = plies('e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 Re1 Nd6 Nxe5 Be7 Bf1 Nxe5 Rxe5 O-O d4 Bf6 Re1 Re8')
const r = reviewGame(p)
const said = (i: number) => spokenMotifs(r.moves[i].motifs).map((m) => motifText(m, p[i].fenAfter, 'es')).filter(Boolean)

describe('remarks on the Berlin (wrong ones reported by the user)', () => {
  it('5. Te1: the e-file still has the black pawn on e5 — half-open, not open', () => {
    expect(said(8)).not.toContain('La columna e queda abierta para las torres.')
    expect(said(8)).toContain('La columna e queda semiabierta para la torre.')
  })
  it('an undefended piece attacked is said once (no "Amenaza capturar…" repeating it)', () => {
    expect(said(8).filter((s) => /caballo de e4/.test(s))).toHaveLength(1)
    expect(said(9).filter((s) => /alfil de b5/.test(s))).toHaveLength(1)
  })
  it('5… Cd6 gives back the pawn it won: no positional sacrifice', () => {
    expect(r.moves[9].motifs.some((m) => m.kind === 'positional-sacrifice')).toBe(false)
  })
  it('4… Cxe4 takes a pawn that White wins back on move 6: it says so', () => {
    expect(said(7)).not.toContain('Gana un peón.')
    expect(said(7)).toContain('Toma un peón, que las blancas recuperan en la jugada 6.')
  })
})

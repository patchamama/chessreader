import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { moveMotifs, motifText, reviewGame, type PlyInput, type Score } from '../../teaching/gameReview.js'

function plies(moves: string, evals: Record<number, Score> = {}): PlyInput[] {
  const c = new Chess()
  let last: Score = { cp: 0 }
  const list = moves.split(' ')
  const at = (k: number) => (evals[k] ? (last = evals[k]) : last)
  const scores = list.map((_, k) => at(k))
  scores.push(at(list.length))
  return list.map((san, i) => {
    const fenBefore = c.fen()
    const m = c.move(san)
    return {
      nodeId: `n${i}`, san: m.san, from: m.from, to: m.to, fenBefore, fenAfter: c.fen(),
      color: m.color === 'w' ? 'white' : 'black', moveNumber: Math.floor(i / 2) + 1,
      before: scores[i], after: scores[i + 1],
    } as PlyInput
  })
}
const after = (fen: string, san: string) => { const c = new Chess(fen); c.move(san); return c.fen() }

describe('looking ahead in the game', () => {
  it('every move that clears the way for a later castling says so (S3)', () => {
    const p = plies('e4 e5 Nf3 Nc6 Bc4 Bc5 O-O')
    const r = reviewGame(p)
    const nf3 = r.moves[2].motifs.find((m) => m.kind === 'prepares-castling')!
    expect(nf3.data).toMatchObject({ side: 'short', move: 4 })
    expect(motifText(nf3, p[2].fenAfter, 'es')).toBe('Despeja el camino del enroque corto, que llega en la jugada 4.')
    expect(r.moves[4].motifs.some((m) => m.kind === 'prepares-castling')).toBe(true)
  })

  it('pieces that line up on the square where the game is decided are pointed out in advance (S4)', () => {
    const p = plies('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#')
    const r = reviewGame(p)
    const bc4 = r.moves[2].motifs.find((m) => m.kind === 'aims-at')!
    expect(bc4.squares[0]).toBe('f7')
    expect(motifText(bc4, p[2].fenAfter, 'es')).toBe('El alfil apunta a f7, junto al rey: allí se decide la partida en la jugada 4.')
    expect(r.moves[4].motifs.some((m) => m.kind === 'aims-at' && m.squares[0] === 'f7')).toBe(true)
  })

  it('a piece that adds itself to an attack already under way is said to join it (S9)', () => {
    const fen = '4k3/4q3/8/4p3/8/8/1B6/4K1N1 w - - 0 1'
    const j = moveMotifs(fen, 'Nf3').find((m) => m.kind === 'joint-attack')!
    expect(motifText(j, after(fen, 'Nf3'), 'es')).toBe('El caballo se suma al ataque del alfil de b2 sobre el peón de e5.')
    expect(motifText(j, after(fen, 'Nf3'), 'en')).toBe('The knight joins the attack of the bishop on b2 on the pawn on e5.')
  })

  it('a defender that alone holds two attacked pieces is overloaded (S12)', () => {
    const fen = '4r1k1/8/2b5/1P6/4N3/8/8/3Q2K1 w - - 0 1'
    const o = moveMotifs(fen, 'Qd3').find((m) => m.kind === 'overloaded')!
    expect(o.squares).toEqual(['d3', 'b5', 'e4'])
    expect(motifText(o, after(fen, 'Qd3'), 'es')).toBe('Cuidado: la dama de d3 es la única defensa del peón de b5 y del caballo de e4; está sobrecargada.')
  })

  it('a piece with no safe square left is trapped, not sacrificed (S5)', () => {
    const p = plies('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 d4 b5 Bb3 Nxd4 Nxd4 exd4 Qxd4 c5 Qd5 Be6 Qc6+ Bd7 Qd5 c4')
    const t = moveMotifs(p[21].fenBefore, 'c4').find((m) => m.kind === 'traps')!
    expect(t.squares).toEqual(['b3'])
    expect(motifText(t, p[21].fenAfter, 'es')).toBe('El alfil de b3 queda atrapado: no tiene ninguna casilla segura.')
  })

  it('a mate names the escape squares and what covers them (S21)', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
    const m = moveMotifs(fen, 'Ra8#').find((x) => x.kind === 'mate')!
    expect(motifText(m, after(fen, 'Ra8#'), 'es')).toBe('Jaque mate. El rey no tiene escape: f8 y h8 las cubre la torre de a8; f7, g7 y h7 están ocupadas por sus propias piezas.')
    expect(motifText(m, after(fen, 'Ra8#'), 'en')).toBe("Checkmate. The king has no escape: f8 and h8 are covered by the rook on a8; f7, g7 and h7 are taken by its own pieces.")
  })

  it('a move after which the engine and the game show material won a few moves later starts a combination (S6)', () => {
    const p = plies('d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5 Bxd8 Bb4+ Qd2 Bxd2+ Kxd2 Kxd8', { 11: { cp: 100 }, 12: { cp: -350 } })
    const r = reviewGame(p)
    expect(r.moves[11].motifs.some((m) => m.kind === 'combination')).toBe(true)
    const c = r.moves[11].motifs.find((m) => m.kind === 'combination')!
    expect(motifText(c, p[11].fenAfter, 'es')).toBe('Empieza una combinación que gana material.')
  })
})

describe('patterns from the Bronstein book (S2, S7)', () => {
  it('a pawn given and never taken back over the next moves is a positional sacrifice (a gambit)', () => {
    // Queen's Gambit Accepted-like: 1. d4 d5 2. c4 dxc4 3. e4 b5 4. a4 c6 5. axb5 cxb5 6. b3 cxb3 ... simpler: King's Gambit
    const p = plies('e4 e5 f4 exf4 Nf3 g5 Bc4 Bg7 O-O d6 d4 h6 c3 Nc6')
    const r = reviewGame(p)
    const f4 = r.moves[2].motifs.find((m) => m.kind === 'positional-sacrifice')!
    expect(f4).toBeTruthy()
    expect(motifText(f4, p[2].fenAfter, 'es')).toBe('Sacrificio posicional: entrega un peón a cambio de juego (no lo recupera en las jugadas siguientes).')
  })

  it('a piece of the opponent that alone guards two attacked pieces is overloaded too', () => {
    // ...Bh4 hits the knight on f2; the rook already hits the one on b2; the queen on d4 alone guards both.
    const o = moveMotifs('1r2k3/8/8/6b1/3Q4/8/1N3N2/7K b - - 0 1', 'Bh4').find((x) => x.kind === 'overloaded')
    expect(o?.squares).toEqual(['d4', 'b2', 'f2'])
    expect(motifText(o!, after('1r2k3/8/8/6b1/3Q4/8/1N3N2/7K b - - 0 1', 'Bh4'), 'es')).toBe('La dama de d4 queda sobrecargada: es la única defensa del caballo de b2 y del caballo de f2.')
  })

  it('the better line says what its first move does', async () => {
    const { annotateGame } = await import('../../teaching/gameReview.js')
    const game = plies('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#', { 0: { cp: 20 }, 3: { cp: -40 }, 6: { mate: 1 } })
    game[5].best = { san: 'g6', line: ['g6', 'Qf3', 'Nf6'] }
    const text = annotateGame(game, reviewGame(game), { level: 3, lang: 'en' })
    expect(text).toMatch(/Better was: \} \(3\.\.\. g6[^)]*\)/)
    expect(text).toMatch(/g6[^{]*\{ [^}]*queen/i)
  })
})

import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { analyseComment, moveCue, lineSquares } from '../../teaching/commentCues.js'
import { findConcepts } from '../../teaching/concepts.js'

function fenAfter(moves: string): string {
  const c = new Chess()
  for (const m of moves.split(' ')) c.move(m)
  return c.fen()
}
// Opera Game positions.
const AFTER_6_BC4 = fenAfter('e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4')
const AFTER_7_QB3 = fenAfter('e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3')
const AFTER_12_OOO = fenAfter('e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O')

const roles = (cues: ReturnType<typeof analyseComment>) =>
  cues.flatMap((c) => c.squares.map((s) => `${s.square}:${s.role}`)).sort()

describe('lineSquares', () => {
  it('lists the squares of a diagonal, a file and a rank', () => {
    expect(lineSquares('a2', 'g8')).toEqual(['a2', 'b3', 'c4', 'd5', 'e6', 'f7', 'g8'])
    expect(lineSquares('d1', 'd8')).toHaveLength(8)
    expect(lineSquares('a8', 'h8')).toHaveLength(8)
    expect(lineSquares('a1', 'b3')).toEqual([])
  })
})

describe('analyseComment (Spanish)', () => {
  it('lights a named square', () => {
    const cues = analyseComment('Amenaza mate en f7.', AFTER_6_BC4)
    expect(roles(cues)).toContain('f7:mention')
  })

  it('makes a named piece blink when it really stands there', () => {
    const cues = analyseComment('La dama de f3 y el alfil de c4 apuntan juntos a la casilla f7.', AFTER_6_BC4)
    const pieces = cues.filter((c) => c.kind === 'piece').flatMap((c) => c.squares)
    expect(pieces).toEqual(
      expect.arrayContaining([
        { square: 'f3', role: 'piece', blink: true },
        { square: 'c4', role: 'piece', blink: true },
      ]),
    )
  })

  it('shows an attack: attacker, target and an arrow between them', () => {
    const cues = analyseComment('La dama ataca el peón de b7 y aumenta la presión sobre f7 por la diagonal a2-g8.', AFTER_7_QB3, {
      lastMove: { from: 'f3', to: 'b3' },
    })
    const rel = cues.find((c) => c.kind === 'relation')!
    expect(rel.squares).toEqual(
      expect.arrayContaining([
        { square: 'b3', role: 'attacker', blink: true },
        { square: 'b7', role: 'target', blink: true },
      ]),
    )
    expect(rel.arrows).toContainEqual({ from: 'b3', to: 'b7', role: 'attacker' })
    const line = cues.find((c) => c.kind === 'line')!
    expect(line.squares.map((s) => s.square)).toEqual(['a2', 'b3', 'c4', 'd5', 'e6', 'f7', 'g8'])
  })

  it('reads a passive pin: "clavado por" makes the LAST piece the attacker', () => {
    const cues = analyseComment('El caballo de d7 está clavado por el alfil de b5.', AFTER_12_OOO)
    const rel = cues.find((c) => c.kind === 'relation')!
    expect(rel.arrows).toContainEqual({ from: 'b5', to: 'd7', role: 'attacker' })
    expect(rel.concept).toBe('pin')
  })

  it('lights a file and a rank', () => {
    const file = analyseComment('El enroque largo lleva la torre a la columna d.', AFTER_12_OOO)
    expect(file.find((c) => c.kind === 'line')!.squares.map((s) => s.square)).toEqual(lineSquares('d1', 'd8'))
    const rank = analyseComment('La torre da mate en la octava fila.', AFTER_12_OOO)
    expect(rank.find((c) => c.kind === 'line')!.squares.map((s) => s.square)).toEqual(lineSquares('a8', 'h8'))
  })

  it('does not take the squares of a quoted move as mentions', () => {
    const cues = analyseComment('Lo normal es 3... exd4 4. Nxd4 Nf6.', AFTER_6_BC4)
    expect(cues.filter((c) => c.kind === 'square')).toEqual([])
  })

  it('computes a pawn structure the text names without squares', () => {
    // After 1.e4 d5 2.exd5 Qxd5 3.Nc3 Qa5 4.d4 c6 5.Bc4 Bf5 6.Bd2 e6 7.Qe2 Bb4 8.a3 Bxc3 9.bxc3: doubled c-pawns.
    const fen = fenAfter('e4 d5 exd5 Qxd5 Nc3 Qa5 d4 c6 Bc4 Bf5 Bd2 e6 Qe2 Bb4 a3 Bxc3 bxc3')
    const cues = analyseComment('Las blancas quedan con peones doblados.', fen)
    const s = cues.find((c) => c.kind === 'structure')!
    expect(s.squares.map((x) => x.square).sort()).toEqual(['c2', 'c3'])
    expect(s.concept).toBe('doubled-pawns')
  })
})

describe('analyseComment (English)', () => {
  it('reads "the knight on d7 is pinned by the bishop on b5"', () => {
    const cues = analyseComment('The knight on d7 is pinned by the bishop on b5.', AFTER_12_OOO)
    expect(cues.find((c) => c.kind === 'relation')!.arrows).toContainEqual({ from: 'b5', to: 'd7', role: 'attacker' })
  })

  it('reads "the d-file" and "a double attack on b7 and f7"', () => {
    expect(analyseComment('The rook takes the d-file.', AFTER_12_OOO).some((c) => c.kind === 'line')).toBe(true)
    const cues = analyseComment('A double attack on b7 and f7.', AFTER_7_QB3)
    expect(roles(cues)).toEqual(expect.arrayContaining(['b7:mention', 'f7:mention']))
    expect(cues.some((c) => c.concept === 'double-attack')).toBe(true)
  })
})

describe('moveCue', () => {
  it('marks origin and destination, a capture and the checked king', () => {
    const c = new Chess()
    for (const m of 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5'.split(' ')) c.move(m)
    const mv = c.move('Bxb5+')
    const cue = moveCue({ san: mv.san, from: mv.from, to: mv.to, fen: c.fen() })
    expect(cue.squares).toEqual(
      expect.arrayContaining([
        { square: 'c4', role: 'from' },
        { square: 'b5', role: 'capture' },
        { square: 'e8', role: 'check', blink: true },
      ]),
    )
    expect(cue.arrows).toEqual([{ from: 'c4', to: 'b5', role: 'to' }])
  })

  it('marks both pieces of a castling move', () => {
    const cue = moveCue({ san: 'O-O-O', from: 'e1', to: 'c1', fen: AFTER_12_OOO })
    expect(cue.squares.map((s) => s.square).sort()).toEqual(['a1', 'c1', 'd1', 'e1'])
    expect(cue.concept).toBe('castling')
  })
})

describe('findConcepts', () => {
  it('finds the concepts a comment names, in both languages', () => {
    expect(findConcepts('Un ataque doble y después una clavada.').map((c) => c.id)).toEqual(['double-attack', 'pin'])
    expect(findConcepts('A discovered check wins the queen; en passant is possible.').map((c) => c.id)).toEqual([
      'discovered-check',
      'en-passant',
    ])
    expect(findConcepts('El Gambito de Rey aceptado.')[0]).toMatchObject({ id: 'gambit' })
  })
})

describe('relations need a subject before the verb, inside the same clause', () => {
  const AFTER_2_D6 = fenAfter('e4 e5 Nf3 d6')
  const AFTER_7_QE7 = fenAfter('e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7')

  it('two pieces named as objects of different verbs are not a relation', () => {
    const cues = analyseComment('Las negras sostienen el peón de e5, pero encierran a su alfil de f8.', AFTER_2_D6)
    expect(cues.filter((c) => c.kind === 'relation')).toEqual([])
  })

  it('several attackers before the verb all point at the target', () => {
    const cues = analyseComment('La dama de f3 y el alfil de c4 apuntan juntos a la casilla f7.', AFTER_6_BC4)
    const rel = cues.find((c) => c.kind === 'relation')!
    expect(rel.arrows).toEqual([
      { from: 'f3', to: 'f7', role: 'attacker' },
      { from: 'c4', to: 'f7', role: 'attacker' },
    ])
  })

  it('a verb with no subject speaks of the piece that just moved', () => {
    const cues = analyseComment('Defiende f7, pero la dama bloquea al alfil de f8.', AFTER_7_QE7, {
      lastMove: { from: 'd8', to: 'e7' },
    })
    const rel = cues.filter((c) => c.kind === 'relation')
    expect(rel[0].arrows).toEqual([{ from: 'e7', to: 'f7', role: 'defender' }])
  })

  it('a clause without a piece before its verb yields nothing', () => {
    const cues = analyseComment('Todas las piezas blancas atacan; el alfil de f8 y la torre de h8 todavía no han jugado.', AFTER_12_OOO)
    expect(cues.filter((c) => c.kind === 'relation')).toEqual([])
  })
})

describe('cue fixes', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  it('"the centre" lights exactly the four central squares', () => {
    for (const text of ['Las blancas dominan el centro.', 'White controls the centre.', 'Weiß beherrscht das Zentrum.']) {
      const cue = analyseComment(text, START).find((c) => c.kind === 'area')!
      expect(cue.squares.map((s) => s.square).sort()).toEqual(['d4', 'd5', 'e4', 'e5'])
    }
  })
  it('an attacked piece named without a square is the ENEMY piece the attacker reaches in one move', () => {
    // White knight d5 attacks the black queen f6; a white queen stands on b3.
    const fen = 'r3kb1r/ppp2ppp/2n2q2/3N4/4P3/1Q6/PP3PPP/R1B1KB1R b KQkq - 0 1'
    const cues = analyseComment('El caballo ocupa la casilla central d5 y ataca a la dama.', fen, { lastMove: { from: 'c3', to: 'd5' } })
    const rel = cues.find((c) => c.kind === 'relation')!
    expect(rel.squares).toEqual([
      { square: 'd5', role: 'attacker', blink: true },
      { square: 'f6', role: 'target', blink: true },
    ])
  })
  it('no relation is drawn when the attacker cannot reach any such enemy piece', () => {
    const cues = analyseComment('El caballo ataca a la dama.', START, { lastMove: { from: 'g1', to: 'f3' } })
    expect(cues.filter((c) => c.kind === 'relation')).toEqual([])
  })
  it('a double attack shows every attacked piece', () => {
    // Knight c7 forks king e8 and rook a8.
    const fen = 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1'
    const cues = analyseComment('El caballo ataca al rey y a la torre.', fen, { lastMove: { from: 'd5', to: 'c7' } })
    const rel = cues.find((c) => c.kind === 'relation')!
    expect(rel.squares.filter((s) => s.role === 'target').map((s) => s.square).sort()).toEqual(['a8', 'e8'])
  })
  it('"alfil de casilla b3" / "peón de la casilla a2" name a piece', () => {
    const fen = '4k3/8/8/8/8/1B6/P7/4K3 w - - 0 1'
    const cues = analyseComment('El alfil de casilla b3 y el peón de la casilla a2.', fen)
    expect(cues.filter((c) => c.kind === 'piece').map((c) => c.squares[0].square)).toEqual(['b3', 'a2'])
  })
  it('a knight heading for a far square shows its route', () => {
    const cues = analyseComment('El caballo salta hasta la casilla d5.', 'rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 1 1', { lastMove: { from: 'b1', to: 'c3' } })
    const route = cues.find((c) => c.kind === 'route')!
    expect(route.arrows).toEqual([{ from: 'c3', to: 'd5', role: 'to' }])
    const far = analyseComment('El caballo de g1 se dirige a d5.', START).find((c) => c.kind === 'route')!
    expect(far.arrows.length).toBe(3)
    expect(far.arrows[0].from).toBe('g1')
    expect(far.arrows[2].to).toBe('d5')
  })
  it('reads German piece names and lines', () => {
    const fen = '4k3/8/8/8/8/1B6/P7/4K3 w - - 0 1'
    const cues = analyseComment('Der Läufer auf b3 beherrscht die Diagonale a2-g8.', fen)
    expect(cues.some((c) => c.kind === 'piece' && c.squares[0].square === 'b3')).toBe(true)
    expect(cues.find((c) => c.kind === 'line')!.squares.length).toBe(7)
  })
  it('the glossary has German titles and definitions', () => {
    const [hit] = findConcepts('Eine Fesselung des Springers.')
    expect(hit.id).toBe('pin')
    expect(hit.title.de).toBe('Fesselung')
    expect(hit.definition.de.length).toBeGreaterThan(20)
  })
})

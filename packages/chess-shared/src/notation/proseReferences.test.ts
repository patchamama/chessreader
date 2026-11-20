import { describe, expect, it } from 'vitest'
import { findProseReferences, resolveProseReference, marksToSquares, detectProseLang, PROSE_REVEAL_STEP_MS } from './proseReferences.js'

// Black queen d8, rook b8/f8 (two rooks), white pawns a2 b2 c2 g2 h2, kings e1 e8.
const FEN = '1r1qkr2/pp3ppp/8/8/8/8/PPP3PP/4K3 w - - 0 21'
const marksOf = (text: string, i = 0, fen = FEN) => resolveProseReference(findProseReferences(text, { lang: 'es' })[i], fen)

describe('S13 idea move', () => {
  const text = '21…Tb6, con idea de Df6'
  it('finds the idea move written after "idea de"', () => {
    const refs = findProseReferences(text, { lang: 'es' })
    expect(refs).toHaveLength(1)
    expect(text.slice(refs[0].start, refs[0].end)).toBe('Df6')
    expect(refs[0].side).toBe('b')
  })
  it('resolves the queen of the side that played the quoted move: origin and destination with an arrow', () => {
    const m = marksOf(text)
    expect(m.arrows).toEqual([{ from: 'd8', to: 'f6' }])
    expect(m.squares.sort()).toEqual(['d8', 'f6'])
  })
  it('with two candidates only the destination is marked, no arrow', () => {
    const m = marksOf('21…Tb6, con idea de Tb7', 0, '1r6/7r/8/8/8/8/8/4K2k w - - 0 21')
    expect(m.arrows).toEqual([])
    expect(m.squares).toEqual(['b7'])
  })
  it('understands English letters', () => {
    const [r] = findProseReferences('21...Rb6, with the idea of Qf6', { lang: 'en' })
    expect(resolveProseReference(r, FEN).arrows).toEqual([{ from: 'd8', to: 'f6' }])
  })
})

describe('S14 plan list', () => {
  const text = 'después de 19…Tc5! un plan de ataque de peones en (a6-a5, Tb8), y luego presión (Dh4), o un ataque sobre las columnas b y c'
  it('reads the pawn pair and the rook move as two references', () => {
    const refs = findProseReferences(text, { lang: 'es' })
    expect(refs.map((r) => text.slice(r.start, r.end))).toEqual(['a6-a5', 'Tb8', 'Dh4', 'columnas b y c'])
    expect(refs.every((r) => r.side === 'b')).toBe(true)
  })
  it('pawn pair: squares and an arrow', () => {
    expect(marksOf(text, 0)).toMatchObject({ squares: ['a6', 'a5'], arrows: [{ from: 'a6', to: 'a5' }] })
  })
  it('the rook that can go to b8 is the one the position allows', () => {
    const m = marksOf(text, 1, '5r1k/7r/8/8/8/8/8/4K3 w - - 0 20')
    expect(m.arrows).toEqual([{ from: 'f8', to: 'b8' }])
  })
  it('queen idea Dh4', () => {
    expect(marksOf(text, 2).arrows).toEqual([{ from: 'd8', to: 'h4' }])
  })
  it('columns b and c light both whole files', () => {
    const m = marksOf(text, 3)
    expect(m.files).toEqual(['b', 'c'])
    expect(marksToSquares(m)).toHaveLength(16)
  })
  it('singular column, range and other languages', () => {
    expect(marksOf('sobre la columna b.', 0).files).toEqual(['b'])
    expect(marksOf('columnas b-d', 0).files).toEqual(['b', 'c', 'd'])
    expect(findProseReferences('on the files b and c.')[0]).toMatchObject({ files: ['b', 'c'] })
    expect(findProseReferences('auf den Linien b und c.')[0]).toMatchObject({ files: ['b', 'c'] })
  })
  it('does not take the Spanish word "a" as a file', () => {
    expect(findProseReferences('la columna a lo largo')).toEqual([])
  })
  it('rows', () => {
    expect(marksOf('la fila 7', 0).ranks).toEqual(['7'])
  })
  it('pawn group of the opponent from file a to d', () => {
    const t = '19…Tc5, presión sobre los peones desde la columna a hasta d'
    const m = marksOf(t, 0)
    expect(m.squares.sort()).toEqual(['a2', 'b2', 'c2'])
  })
  it('a variation in parentheses is not a plan', () => {
    expect(findProseReferences('(19.Tb8 Dh4)')).toEqual([])
  })
})

describe('S15 pawn advance', () => {
  it('avance g2-g4: both squares and the arrow', () => {
    const m = marksOf('avance g2-g4')
    expect(m.squares).toEqual(['g2', 'g4'])
    expect(m.arrows).toEqual([{ from: 'g2', to: 'g4' }])
  })
  it('chained form h2-h4-h5: three squares, two arrows', () => {
    const t = 'un ataque con el avance h2-h4-h5'
    const refs = findProseReferences(t)
    expect(t.slice(refs[0].start, refs[0].end)).toBe('h2-h4-h5')
    const m = resolveProseReference(refs[0], FEN)
    expect(m.squares).toEqual(['h2', 'h4', 'h5'])
    expect(m.arrows).toEqual([{ from: 'h2', to: 'h4' }, { from: 'h4', to: 'h5' }])
  })
  it('advance / Vorstoß', () => {
    expect(findProseReferences('the advance g2-g4')[0].kind).toBe('advance')
    expect(findProseReferences('der Vorstoß g2-g4')[0].kind).toBe('advance')
  })
  it('a plain pair without the word is not a reference', () => {
    expect(findProseReferences('la jugada g2-g4 es fuerte')).toEqual([])
  })
})

describe('S16 language and flanks', () => {
  const ES = 'Las negras juegan con la idea de que el rey de las blancas queda en el centro, y luego Rf6 es posible'
  it('Spanish text: R is the king, D/T/A/C queen, rook, bishop, knight', () => {
    const t = `${ES} (Rf6)`
    const [r] = findProseReferences(t)
    expect(r).toMatchObject({ kind: 'idea', piece: 'k' })
  })
  it('English text keeps R as the rook', () => {
    const t = 'Black plays the rook to the centre and the idea of the move is to win the pawn (Rf6)'
    expect(findProseReferences(t)[0]).toMatchObject({ kind: 'idea', piece: 'r' })
  })
  it('detects the language of a prose', () => {
    expect(detectProseLang(ES)).toBe('es')
    expect(detectProseLang('Der Springer ist nicht gut und die Dame auf dem Brett mit dem Läufer')).toBe('de')
  })
  const FEN2 = '4k3/8/8/8/8/8/PPP2PPP/4K3 w - - 0 20'
  it('a king-side pawns phrase lights the pawns on f, g, h one after another', () => {
    const t = 'luego presión sobre los peones del flanco de rey'
    const [r] = findProseReferences(t, { lang: 'es' })
    expect(t.slice(r.start, r.end)).toBe('peones del flanco de rey')
    const m = resolveProseReference({ ...r, side: 'b' }, FEN2)
    expect(m.sequence).toEqual(['f2', 'g2', 'h2'])
  })
  it('queen-side, English and German phrases; without a pressure cue it is the mover side', () => {
    expect(resolveProseReference({ ...findProseReferences('the queen-side pawns', { lang: 'en' })[0], side: 'w' }, FEN2).sequence).toEqual(['a2', 'b2', 'c2'])
    expect(findProseReferences('der Königsflügel', { lang: 'de' })[0]).toMatchObject({ kind: 'flank', flank: 'king' })
    expect(findProseReferences('los peones del flanco de dama', { lang: 'es' })[0]).toMatchObject({ flank: 'queen', opponent: false })
  })
  it('the step is between 0.5 and 1 s', () => {
    expect(PROSE_REVEAL_STEP_MS).toBeGreaterThanOrEqual(500)
    expect(PROSE_REVEAL_STEP_MS).toBeLessThanOrEqual(1000)
  })
})

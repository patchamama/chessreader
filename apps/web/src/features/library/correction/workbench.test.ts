import { describe, it, expect } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { initialMoves, checkMoves, exportPgn, correctionList, applyToText, normaliseSan } from './workbench'

// "3. Bb4" is a misprint for "3. Bb5": the workbench shows what is WRITTEN.
const TEXT = 'Smith – Jones\n1. e4 e5 2. Nf3 Nc6 3. Bb4 a6 4. Ba4 Nf6 (4... d6 5. c3) 5. O-O Be7'
const [game] = recognizeGames(TEXT, { algorithm: 2 })

describe('initialMoves', () => {
  const moves = initialMoves(TEXT, game)
  it('lists every move written at top level, also after the point where recognition stopped', () => {
    expect(moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb4', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'])
  })
  it('carries the repair the reader proposed as a suggestion', () => {
    expect(moves[4]).toMatchObject({ san: 'Bb4', repaired: true, suggestion: 'Bb5' })
  })
  it('keeps where each move is written', () => {
    const bb9 = moves[4]
    expect(TEXT.slice(bb9.source!.charStart, bb9.source!.charEnd)).toBe('Bb4')
  })
})

describe('checkMoves', () => {
  const sans = initialMoves(TEXT, game).map((m) => m.san)
  it('reports the first move that does not fit and the legal moves that look like it', () => {
    const r = checkMoves(sans)
    expect(r.legal).toBe(4)
    expect(r.error).toMatchObject({ index: 4, san: 'Bb4' })
    expect(r.error!.candidates.slice(0, 2)).toEqual(['Bb5', 'Bc4'])
  })
  it('passes to the end once the move is corrected', () => {
    const fixed = [...sans]
    fixed[4] = 'Bb5'
    expect(checkMoves(fixed)).toEqual({ legal: 10, fens: expect.any(Array) })
  })
  it('can check only up to a given move', () => {
    expect(checkMoves(sans, { upTo: 4 }).error).toBeUndefined()
    expect(checkMoves(sans, { upTo: 5 }).error!.index).toBe(4)
  })
  it('accepts Spanish letters and figurines typed by hand', () => {
    expect(normaliseSan('Cf3')).toBe('Nf3')
    expect(normaliseSan('♗b5')).toBe('Bb5')
    expect(normaliseSan('0-0')).toBe('O-O')
    expect(checkMoves(['e4', 'e5', 'Cf3', 'Cc6', 'Ab5']).legal).toBe(5)
  })
})

describe('export', () => {
  const moves = initialMoves(TEXT, game)
  const edited = moves.map((m) => ({ ...m }))
  edited[4] = { ...edited[4], san: 'Bb5' }                       // replaced
  edited.splice(8, 0, { id: 'new', san: 'd3' })                  // inserted (will be illegal order, irrelevant here)
  edited.splice(2, 1)                                             // deleted Nf3

  it('writes the game as PGN', () => {
    expect(exportPgn(['e4', 'e5', 'Nf3'], { white: 'Smith', black: 'Jones' })).toBe(
      '[White "Smith"]\n[Black "Jones"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *\n',
    )
  })
  it('lists what changed against the source, with its place in the text', () => {
    const list = correctionList(TEXT, moves, edited)
    expect(list.map((c) => c.kind)).toEqual(['deleted', 'replaced', 'inserted'])
    expect(list[1]).toMatchObject({ kind: 'replaced', written: 'Bb4', corrected: 'Bb5', charStart: TEXT.indexOf('Bb4') })
    expect(list[2]).toMatchObject({ kind: 'inserted', corrected: 'd3' })
  })
  it('applies the corrections to the text', () => {
    const only = moves.map((m) => ({ ...m }))
    only[4] = { ...only[4], san: 'Bb5' }
    const fixed = applyToText(TEXT, moves, only)
    expect(fixed).toBe(TEXT.replace('Bb4', 'Bb5'))
    const [again] = recognizeGames(fixed, { algorithm: 2 })
    expect(again.tree.mainline.length).toBe(10)
    expect(again.tree.errors).toEqual([])
  })
})

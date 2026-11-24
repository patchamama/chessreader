import { beforeEach, describe, expect, it } from 'vitest'
import { guideKey, localActionsFor, normGuideText, textHash, useGuideStore } from './guideStore'

const FEN = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 3'
const TEXT = 'Despejando la diagonal de nuestro alfil de casillas blancas y preparando el avance f5!'

beforeEach(() => useGuideStore.getState().clear())

describe('the local guide store (ai-narration-guides S2)', () => {
  it('keys a paragraph by book, chapter and the hash of its normalised text', () => {
    expect(textHash(normGuideText(`  ${TEXT}\n`))).toBe(textHash(TEXT))
    expect(guideKey(7, 3, TEXT)).toBe(guideKey(7, 3, `${TEXT}  `))
    expect(guideKey(7, 3, TEXT)).not.toBe(guideKey(7, 4, TEXT))
    expect(guideKey(7, 3, TEXT)).not.toBe(guideKey(8, 3, TEXT))
    expect(guideKey(7, 3, TEXT)).not.toBe(guideKey(7, 3, `${TEXT} más`))
  })

  it('stores a guide and gives it back to the narrator by the text and the position', () => {
    useGuideStore.getState().set(guideKey(7, 3, TEXT), { text: TEXT, fen: FEN, actions: '0Diagonal:c8-h3' })
    expect(localActionsFor(TEXT, FEN)).toBe('0Diagonal:c8-h3')
    expect(localActionsFor(TEXT, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBeUndefined()
    expect(localActionsFor('Otro texto distinto que no es el guardado en absoluto', FEN)).toBeUndefined()
  })

  it('persists in localStorage', () => {
    useGuideStore.getState().set('k', { text: TEXT, fen: FEN, actions: '0Clear' })
    expect(localStorage.getItem('chessreader-narration-guides')).toContain('0Clear')
  })
})

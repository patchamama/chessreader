import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const { parsePlacement, boardSvg, highlightMoves, afterLabel } = createRequire(import.meta.url)('./public/chess-view.js')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'

describe('boardSvg', () => {
  it('draws the 64 squares and every piece of a FEN, and nothing for a bad one', () => {
    const svg = boardSvg(START, { size: 160 })
    expect((svg.match(/<rect/g) ?? []).length).toBe(64)
    expect((svg.match(/<text/g) ?? []).length).toBe(32)
    expect(svg).toContain('♔')
    expect(boardSvg('not a fen')).toBe('')
    expect(boardSvg('8/8/8/8/8/8/8 w')).toBe('')
    expect(parsePlacement('8/8/8/8/8/8/8/9')).toBeNull()
  })
  it('lights the marked square', () => {
    expect(boardSvg(START, { mark: 'e4' })).toContain('#f6e05e')
    expect(boardSvg(START)).not.toContain('#f6e05e')
  })
  it('escapes the FEN in the label', () => {
    expect(boardSvg(START)).not.toMatch(/aria-label="[^"]*"[^>]*"/)
  })
})

describe('highlightMoves', () => {
  it('wraps moves in several notations, with numbers, figurines and castling', () => {
    const html = highlightMoves('After 12...Nb6 the ♘f3 and Cxe5, 13. Bxe6+ or O-O win; Dh4!')
    for (const m of ['12...Nb6', '♘f3', 'Cxe5', '13. Bxe6+', 'O-O', 'Dh4!']) expect(html).toContain(`<mark class="mv">${m}</mark>`)
  })
  it('leaves ordinary words alone and escapes the HTML of the text', () => {
    const html = highlightMoves('A plan <b>& idea</b> with the bishop pair')
    expect(html).not.toContain('<mark')
    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('&amp;')
  })
})

describe('afterLabel', () => {
  it('names the move that leads to the position, or the initial position', () => {
    expect(afterLabel(35, 'Bxf6')).toBe('after 18. Bxf6')
    expect(afterLabel(36, 'Qe7')).toBe('after 18... Qe7')
    expect(afterLabel(0, '')).toBe('initial position')
  })
})

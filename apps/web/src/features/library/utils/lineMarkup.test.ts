import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { guessPieceLangs, lineToBoardButton, markLine, markProseMoves, resolveSan } from './lineMarkup'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const fenAfter = (moves: string) => {
  const c = new Chess()
  for (const m of moves.split(' ')) c.move(m)
  return c.fen()
}
const AFTER_NF3 = fenAfter('e4 e5 Nf3') // Black to move: the position before 2... Qf6?

const parse = (html: string) => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('resolveSan: a move written in any of the book languages, played from a position', () => {
  it('reads English, Spanish and German letters', () => {
    expect(resolveSan(new Chess(AFTER_NF3), 'Cf6')?.san).toBe('Nf6')
    expect(resolveSan(new Chess(AFTER_NF3), 'Nf6')?.san).toBe('Nf6')
    expect(resolveSan(new Chess(fenAfter('e4 e5')), 'Sf3')?.san).toBe('Nf3')
    expect(resolveSan(new Chess(fenAfter('e4 e5')), 'Ac4')?.san).toBe('Bc4')
  })
  it('null for an illegal move', () => {
    expect(resolveSan(new Chess(START), 'Cf6')).toBeNull()
    expect(resolveSan(new Chess(START), 'e5')).toBeNull()
  })
  it('a Spanish text prefers the Spanish king (R) over the English rook', () => {
    expect(guessPieceLangs('5... Re7 6. Te1 Df4')[0]).toBe('es')
    expect(guessPieceLangs('5... Ke7 6. Re1 Qf4')[0]).toBe('en')
  })
})

describe('markLine: a variation or an engine line as a playable line (S5, S9)', () => {
  it('wraps the moves in a chess-line with the start position and the moves in SAN', () => {
    const html = markLine('(2... Cf6 3. Cxe5 d6 4. Cf3)', AFTER_NF3)!
    const line = parse(html).querySelector('span.chess-line')!
    expect(line.getAttribute('data-line-start')).toBe(AFTER_NF3)
    expect(line.getAttribute('data-line-moves')).toBe('Nf6 Nxe5 d6 Nf3')
    const moves = [...line.querySelectorAll('span.line-move')]
    expect(moves.map((m) => [m.getAttribute('data-ply'), m.textContent])).toEqual([['1', 'Cf6'], ['2', 'Cxe5'], ['3', 'd6'], ['4', 'Cf3']])
    expect(parse(html).textContent).toBe('(2... Cf6 3. Cxe5 d6 4. Cf3)')
  })
  it('stops at the first move that cannot be played; nothing playable → null', () => {
    const html = markLine('3. Cf3 d6 Qz9 (−0.6)', fenAfter('e4 e5 Qh5 Nc6'))!
    expect(parse(html).querySelector('.chess-line')!.getAttribute('data-line-moves')).toBe('Nf3 d6')
    expect(parse(html).textContent).toBe('3. Cf3 d6 Qz9 (−0.6)')
    expect(markLine('(2... Cf6)', START)).toBeNull()
  })
})

describe('markProseMoves: moves quoted in a book comment (S5)', () => {
  it('marks the moves that can be played from the comment position and escapes the rest', () => {
    const html = markProseMoves('Better is 2... Nf6 3. Nxe5 d6, <said> the author.', AFTER_NF3)
    const div = parse(html)
    const line = div.querySelector('.chess-line')!
    expect(line.getAttribute('data-line-start')).toBe(AFTER_NF3)
    expect(line.getAttribute('data-line-moves')).toBe('Nf6 Nxe5 d6')
    expect(div.textContent).toBe('Better is 2... Nf6 3. Nxe5 d6, <said> the author.')
  })
  it('leaves illegal moves and lone square names as plain text', () => {
    expect(markProseMoves('White should play 1. Qh5 here.', AFTER_NF3)).toBe('White should play 1. Qh5 here.')
    expect(markProseMoves('The square d5 is weak.', AFTER_NF3)).toBe('The square d5 is weak.')
  })
})

describe('lineToBoardButton', () => {
  it('carries the line and is skipped by the recogniser', () => {
    const b = parse(lineToBoardButton(AFTER_NF3, ['Nf6', 'Nxe5'])).querySelector('button')!
    expect(b.getAttribute('type')).toBe('button')
    expect(b.className).toBe('line-to-board')
    expect(b.hasAttribute('data-no-recognition')).toBe(true)
    expect(b.getAttribute('data-line-start')).toBe(AFTER_NF3)
    expect(b.getAttribute('data-line-moves')).toBe('Nf6 Nxe5')
  })
})

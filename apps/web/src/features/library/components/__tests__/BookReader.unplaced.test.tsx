import { describe, it, expect } from 'vitest'
import { paintUnplacedMoves } from '../../utils/unplacedMoves'

// Re-wrap idempotence: the reader unwraps `span[data-unplaced]` back to the book's text.
describe('unplaced variation moves survive a re-wrap', () => {
  it('paint, unwrap (data-raw) and paint again gives the same single span', () => {
    const c = document.createElement('div')
    c.innerHTML = '<p>x Kh8 y</p>'
    const games = [{ tree: { unplacedVariationMoves: [{ charStart: 2, charEnd: 5, san: 'Kh8', reason: 'illegal' }] } }] as never
    paintUnplacedMoves(c, games)
    expect(c.querySelectorAll('span[data-unplaced]')).toHaveLength(1)
    c.querySelectorAll('span[data-unplaced]').forEach((el) => {
      el.parentNode!.replaceChild(document.createTextNode(el.getAttribute('data-raw') ?? el.textContent ?? ''), el)
    })
    c.normalize()
    expect(c.querySelectorAll('span[data-unplaced]')).toHaveLength(0)
    paintUnplacedMoves(c, games)
    expect(c.querySelectorAll('span[data-unplaced]')).toHaveLength(1)
    expect(c.textContent).toBe('x Kh8 y')
  })
})

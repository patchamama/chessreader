import { describe, it, expect } from 'vitest'
import { paintUnplacedMoves } from './unplacedMoves'

const game = (list: unknown[]) => ({ tree: { unplacedVariationMoves: list } }) as never

describe('paintUnplacedMoves', () => {
  it('underlines in red the token at its offsets, with a title', () => {
    const c = document.createElement('div')
    c.innerHTML = '<p>See (4. Kh8 Nxe4) here</p>'
    const text = c.textContent!
    const s = text.indexOf('Kh8')
    paintUnplacedMoves(c, [game([{ charStart: s, charEnd: s + 3, san: 'Kh8', reason: 'illegal' }])])
    const span = c.querySelector('span[data-unplaced]') as HTMLElement
    expect(span.textContent).toBe('Kh8')
    expect(span.className).toContain('decoration-red-500')
    expect(span.className).toContain('decoration-wavy')
    expect(span.title).toBe('Move not found in the variation: Kh8 (it is not legal here)')
    expect(span.hasAttribute('data-san')).toBe(false)
    expect(c.textContent).toBe(text)
  })

  it('crosses inline tags and does nothing without entries', () => {
    const c = document.createElement('div')
    c.innerHTML = '<p>a <b>N</b>xe4 b</p>'
    paintUnplacedMoves(c, [game([])])
    expect(c.querySelector('span[data-unplaced]')).toBeNull()
    paintUnplacedMoves(c, [game([{ charStart: 2, charEnd: 6, san: 'Nxe4', reason: 'after-illegal' }])])
    expect([...c.querySelectorAll('span[data-unplaced]')].map((e) => e.textContent).join('')).toBe('Nxe4')
  })
})

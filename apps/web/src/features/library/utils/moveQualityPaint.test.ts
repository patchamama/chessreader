import { describe, expect, it } from 'vitest'
import { CUE_COLORS } from '../narration/cueStyles'
import { paintMoveQualities } from './moveQualityPaint'

// reader-analysis-round S11: moves of the text coloured by their evaluation.

const host = () => {
  const div = document.createElement('div')
  div.innerHTML = '<span data-node-id="0:a" data-game-index="0">e4</span> <span data-node-id="0:b" data-game-index="0">e5</span>'
    + ' <span data-node-id="1:a" data-game-index="1">d4</span> <span data-iso-square="e3">♖xe3</span>'
  return div
}

describe('paintMoveQualities', () => {
  it('colours each rated move with the colour of its rating, and leaves the others alone', () => {
    const root = host()
    paintMoveQualities(root, (g) => (g === 0 ? { a: 'good', b: 'bad' } : null))
    const [e4, e5, d4] = [...root.querySelectorAll<HTMLElement>('span[data-node-id]')]
    expect(e4.dataset.evalQuality).toBe('good')
    expect(e5.dataset.evalQuality).toBe('bad')
    expect(e5.style.color).not.toBe('')
    expect(e5.style.boxShadow).toContain('inset')
    expect(d4.hasAttribute('data-eval-quality')).toBe(false)
    expect(CUE_COLORS.bad).toBeTruthy()
  })

  it('takes the colours away when the colouring is off', () => {
    const root = host()
    paintMoveQualities(root, () => ({ a: 'dubious' }))
    paintMoveQualities(root, null)
    for (const span of root.querySelectorAll<HTMLElement>('span[data-node-id]')) {
      expect(span.hasAttribute('data-eval-quality')).toBe(false)
      expect(span.style.color).toBe('')
    }
  })
})

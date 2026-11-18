import { describe, it, expect, vi, afterEach } from 'vitest'
import { captureTopAnchor, restoreTopAnchor, captureOffset, restoreOffset } from './scrollAnchor'
import { flashElement } from './flash'

/** An element whose box is read from `box` (top/height relative to the viewport). */
function boxed(box: { top: number; height: number }): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    top: box.top, bottom: box.top + box.height, height: box.height,
    left: 0, right: 100, width: 100, x: 0, y: box.top, toJSON: () => ({}),
  }) as DOMRect
  document.body.append(el)
  return el
}

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers() })

describe('keep the first visible text line in place (S10)', () => {
  it('anchors the first block crossing the top edge, at the same line inside it, after a reflow', () => {
    const scroller = boxed({ top: 100, height: 500 })
    scroller.scrollTop = 1000
    const a = { top: -200, height: 250 } // ends above the top edge
    const b = { top: 80, height: 100 } // crosses the top edge: 20 px of it are above
    const c = { top: 180, height: 100 }
    const blocks = [boxed(a), boxed(b), boxed(c)]
    const anchor = captureTopAnchor(scroller, blocks)
    expect(anchor?.el).toBe(blocks[1])
    expect(anchor?.fraction).toBeCloseTo(0.2)

    // The column got narrower: every block is taller and sits lower.
    b.top = 300
    b.height = 200
    restoreTopAnchor(scroller, anchor!)
    // The same line (20 % into b, now 40 px in) must be back at the top edge (100).
    expect(scroller.scrollTop).toBe(1000 + (300 + 40 - 100))
  })

  it('returns no anchor when nothing is on screen, and restoring a removed element does nothing', () => {
    const scroller = boxed({ top: 0, height: 100 })
    expect(captureTopAnchor(scroller, [])).toBeNull()
    const gone = boxed({ top: 10, height: 10 })
    const anchor = captureTopAnchor(scroller, [gone])!
    gone.remove()
    scroller.scrollTop = 50
    restoreTopAnchor(scroller, anchor)
    expect(scroller.scrollTop).toBe(50)
  })
})

describe('keep an updated element where it was on screen (S6)', () => {
  it('restores the element top to the same offset from the scroller top', () => {
    const scroller = boxed({ top: 50, height: 400 })
    scroller.scrollTop = 600
    const box = { top: 150, height: 300 }
    const el = boxed(box)
    const offset = captureOffset(scroller, el)
    expect(offset).toBe(100)
    box.top = 400 // the content above changed, the element moved down
    restoreOffset(scroller, el, offset)
    expect(scroller.scrollTop).toBe(600 + 250)
  })
})

describe('flash an updated element', () => {
  it('adds the flash class and removes it after about two seconds', () => {
    vi.useFakeTimers()
    const el = document.createElement('div')
    flashElement(el)
    expect(el.classList.contains('flash-update')).toBe(true)
    vi.advanceTimersByTime(1900)
    expect(el.classList.contains('flash-update')).toBe(true)
    vi.advanceTimersByTime(200)
    expect(el.classList.contains('flash-update')).toBe(false)
  })
})

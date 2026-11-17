import { describe, it, expect, vi } from 'vitest'
import { followActiveMove } from './autoscroll'

describe('autoscroll (S20)', () => {
  it('centres the move being played or narrated when on', () => {
    const el = { scrollIntoView: vi.fn() } as unknown as HTMLElement
    followActiveMove(el, true)
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })
  it('leaves the page where the reader put it when off', () => {
    const el = { scrollIntoView: vi.fn() } as unknown as HTMLElement
    followActiveMove(el, false)
    expect(el.scrollIntoView).not.toHaveBeenCalled()
  })
})

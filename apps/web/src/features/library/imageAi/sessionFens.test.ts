import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionFenStore, withSessionFens } from './sessionFens'

const FEN = '6k1/8/8/8/8/8/8/R5K1 w - - 0 30'

describe('session FENs', () => {
  beforeEach(() => useSessionFenStore.setState({ fens: {} }))

  it('keeps the accepted FEN of an image by its src for this session', () => {
    useSessionFenStore.getState().setFen('/api/library/books/1/images/a.png', FEN)
    expect(useSessionFenStore.getState().fens).toEqual({ '/api/library/books/1/images/a.png': FEN })
  })

  it('writes the FEN on the image and a hidden FEN line after its block, so the recogniser starts the following moves from it', () => {
    const html = '<p>Text</p><p><img src="/api/library/books/1/images/a.png"></p><p>30.Ra8+ Kh7</p>'
    const out = withSessionFens(html, { '/api/library/books/1/images/a.png': FEN })
    const doc = new DOMParser().parseFromString(out, 'text/html')
    expect(doc.querySelector('img')?.getAttribute('data-fen')).toBe(FEN)
    const hidden = doc.querySelector('[data-session-fen]')
    expect(hidden?.textContent).toBe(FEN)
    expect(hidden?.classList.contains('epub-fen-hidden')).toBe(true)
    expect(hidden?.previousElementSibling?.querySelector('img')).toBeTruthy()
  })

  it('leaves the HTML alone without FENs for its images, and never replaces a FEN the book prints', () => {
    const html = '<p><img src="/b.png"></p>'
    expect(withSessionFens(html, {})).toBe(html)
    expect(withSessionFens(html, { '/other.png': FEN })).toBe(html)
    const printed = '<p><img src="/b.png" data-text-fen="8/8/8/8/8/8/8/8 w - - 0 1"></p>'
    expect(withSessionFens(printed, { '/b.png': FEN })).toBe(printed)
  })
})

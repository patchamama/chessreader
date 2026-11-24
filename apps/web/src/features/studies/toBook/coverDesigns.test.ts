import { describe, expect, it } from 'vitest'
import { coverDesigns, coverFromFile, renderCover, wrapText } from './coverDesigns'

describe('wrapText', () => {
  it('breaks a title into lines and keeps a long word whole', () => {
    expect(wrapText('The invented guide to quiet endgames', 14)).toEqual(['The invented', 'guide to quiet', 'endgames'])
    expect(wrapText('Supercalifragilistic', 8)).toEqual(['Supercalifragilistic'])
  })
  it('joins the overflow into the last line', () => {
    expect(wrapText('aa bb cc dd ee', 2, 3)).toEqual(['aa', 'bb', 'c…'])
  })
})

describe('coverDesigns', () => {
  const designs = coverDesigns('Invented <Course> & more', 'Ann "Nobody"')
  it('offers several designs with unique ids, each a valid SVG with the title and the author escaped', () => {
    expect(designs.length).toBeGreaterThanOrEqual(3)
    expect(new Set(designs.map((d) => d.id)).size).toBe(designs.length)
    for (const d of designs) {
      const doc = new DOMParser().parseFromString(d.svg, 'image/svg+xml')
      expect(doc.querySelector('parsererror')).toBeNull()
      expect(d.svg).toContain('Invented &lt;Course&gt;')
      expect(d.svg).toContain('Ann &quot;Nobody&quot;')
    }
  })
  it('draws a board or pieces in every design', () => {
    for (const d of designs) expect(d.svg).toMatch(/<rect|<svg x=/)
  })
})

describe('renderCover / coverFromFile', () => {
  it('falls back to the SVG itself when the browser cannot draw it', async () => {
    const c = await renderCover('<svg xmlns="http://www.w3.org/2000/svg"/>', undefined, 20)
    expect(c.mime).toBe('image/svg+xml')
    expect(atob(c.data)).toContain('<svg')
  })
  it('reads an uploaded image and refuses other types', async () => {
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'c.png', { type: 'image/png' })
    expect(await coverFromFile(png)).toEqual({ mime: 'image/png', data: btoa(String.fromCharCode(137, 80, 78, 71)) })
    await expect(coverFromFile(new File(['x'], 'c.svg', { type: 'image/svg+xml' }))).rejects.toThrow(/PNG/)
  })
})

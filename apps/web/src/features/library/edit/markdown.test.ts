import { describe, it, expect } from 'vitest'
import { markdownToHtml } from './markdown'

const body = (md: string) => new DOMParser().parseFromString(markdownToHtml(md), 'text/html').body

describe('markdownToHtml', () => {
  it('headings, paragraphs, bold and italic', () => {
    expect(markdownToHtml('# Title\n\nA **bold** and *italic* _word_.\nSame paragraph.'))
      .toBe('<h1>Title</h1>\n<p>A <strong>bold</strong> and <em>italic</em> <em>word</em>.\nSame paragraph.</p>')
  })

  it('lists, ordered and unordered', () => {
    const b = body('- a\n- b\n\n1. one\n2. two')
    expect(b.querySelectorAll('ul > li')).toHaveLength(2)
    expect(b.querySelectorAll('ol > li')).toHaveLength(2)
  })

  it('tables', () => {
    const b = body('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')
    expect(Array.from(b.querySelectorAll('th')).map((t) => t.textContent)).toEqual(['A', 'B'])
    expect(b.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('links only to http(s); images also from image data URLs', () => {
    const b = body('[ok](https://example.org) [bad](javascript:alert(1)) ![d](data:image/png;base64,AAAA) ![x](file:///etc/passwd)')
    expect(b.querySelector('a')?.getAttribute('href')).toBe('https://example.org')
    expect(b.querySelectorAll('a')).toHaveLength(1)
    expect(b.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(b.querySelectorAll('img')).toHaveLength(1)
  })

  it('escapes text and keeps raw HTML blocks for the sanitiser', () => {
    expect(markdownToHtml('a < b & c')).toBe('<p>a &lt; b &amp; c</p>')
    expect(markdownToHtml('<div class="x">raw</div>')).toBe('<div class="x">raw</div>')
  })
})

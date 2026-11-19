import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { parseEpub, scopeEpubCss } from './epubBook'
import { PNG, tinyEpub } from './tinyEpub.fixture'

describe('an EPUB read in the browser (like the server does)', () => {
  it('names each spine document from the TOC, its heading, or the chapter it continues', () => {
    const book = parseEpub(tinyEpub())
    expect(book.title).toBe('Mi libro')
    // The heading breaks the TOC label into lines: the lines are kept.
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1', '5. El — cambio', '5. El — cambio (2)', 'Final'])
  })

  it('falls back to the NCX when there is no nav document', () => {
    expect(parseEpub(tinyEpub({ nav: false })).chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Capítulo NCX', 'Capítulo NCX (2)', 'Heading only'])
  })

  it('keeps the chapter body with its stylesheet scoped to the reader content', () => {
    const c1 = parseEpub(tinyEpub()).chapters[1].html
    expect(c1).toMatch(/^<style data-epub-stylesheet="1">/)
    expect(c1).toContain(':where(.epub-content) {margin: 0}')
    expect(c1).toContain(':where(.epub-content) span.h3 {font-weight: bold; font-size: 130%}')
    expect(c1).toContain(':where(.epub-content) p {text-indent: 1em}')
    expect(c1).not.toMatch(/@import|@font-face|url\(/)
    expect(c1).toContain('<span class="h3">Sub</span>')
    expect(c1).toContain('<h1>5. El<br>cambio</h1>')
    // An empty <div/> stays empty (does not swallow what follows).
    expect(c1).toContain('<div></div><p>1.e4 e5</p>')
    expect(c1).not.toContain('<link')
    // Styles written in the document head are kept too.
    expect(parseEpub(tinyEpub()).chapters[2].html).toContain(':where(.epub-content) p.x {color: red}')
  })

  it('turns the images of a chapter into URLs the browser can load', () => {
    const made: string[] = []
    const c1 = parseEpub(tinyEpub(), { imageUrl: (bytes, type, path) => { made.push(`${path} ${type} ${bytes.length}`); return 'blob:img-1' } }).chapters[1].html
    expect(c1).toContain('src="blob:img-1"')
    expect(c1).toContain('alt="Diagrama 1"')
    expect(c1).toMatch(/<image [^>]*href="blob:img-1"/)
    // One URL per image, however many times it is shown.
    expect(made).toEqual([`OEBPS/Images/d 1.png image/png ${PNG.length}`])
  })

  it('uses data URLs when the browser cannot make object URLs', () => {
    const c1 = parseEpub(tinyEpub(), { imageUrl: undefined }).chapters[1].html
    expect(c1).toMatch(/src="(?:blob:|data:image\/png;base64,)/)
  })

  it('throws on a file that is not an EPUB', () => {
    expect(() => parseEpub(strToU8('plain text'))).toThrow()
    expect(() => parseEpub(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/EPUB/)
  })

  it('scopes html/body to the content root and keeps @media rules', () => {
    expect(scopeEpubCss('html body.x { color: red } @media screen { h1, h2 { margin: 0 } } @page { margin: 0 }'))
      .toBe(':where(.epub-content) {color: red}\n@media screen {\n:where(.epub-content) h1, :where(.epub-content) h2 {margin: 0}\n}')
    expect(scopeEpubCss('p::after { content: "</style>" }')).not.toContain('</style')
  })
})

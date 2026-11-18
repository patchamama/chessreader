import { describe, it, expect } from 'vitest'
import {
  formatChapterTitle,
  hideFensNextToDiagrams,
  joinTitleLines,
  prepareChapterHtml,
  rewriteImageSources,
} from './epubContent'
import { htmlToProseText } from './proseText'

const FEN = '3b4/pp6/8/8/2k1K1P1/2p5/P3N2P/8 w - - 0 1'

const root = (html: string) => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('rewriteImageSources', () => {
  it('points relative image paths at the book image endpoint', () => {
    expect(rewriteImageSources('<img alt="" src="../Images/qed_5g.jpg" />', 6)).toBe(
      '<img alt="" src="/api/library/books/6/images/Images/qed_5g.jpg" />',
    )
    expect(rewriteImageSources('<image xlink:href="../Images/cover.jpeg"/>', 6)).toBe(
      '<image xlink:href="/api/library/books/6/images/Images/cover.jpeg"/>',
    )
  })

  it('encodes spaces and accents but never double-encodes', () => {
    expect(rewriteImageSources('<img src="Images/Diagrama 1 ñ.jpg">', 3)).toBe(
      '<img src="/api/library/books/3/images/Images/Diagrama%201%20%C3%B1.jpg">',
    )
    expect(rewriteImageSources('<img src="Images/a%20b.jpg">', 3)).toBe('<img src="/api/library/books/3/images/Images/a%20b.jpg">')
  })

  it('leaves absolute, data and anchor references alone', () => {
    const html = '<img src="data:image/png;base64,AA"><img src="https://x/y.png"><img src="/api/a.png"><a href="#n1">1</a><a href="c2.xhtml">c</a>'
    expect(rewriteImageSources(html, 1)).toBe(html)
  })
})

describe('joinTitleLines', () => {
  it('turns a chapter title written over several lines into one line with the separator', () => {
    const el = root('<h1 style="margin-top:20%">Capítulo dos<br />\n  Emanuel II</h1><p>Texto<br/>con salto</p>')
    expect(joinTitleLines(el, ' - ')).toBe(1)
    expect(el.querySelector('h1')?.textContent).toBe('Capítulo dos - Emanuel II')
    expect(el.querySelector('h1 br')).toBeNull()
    // Only the chapter title: a paragraph keeps its line break.
    expect(el.querySelector('p br')).not.toBeNull()
  })

  it('uses the chosen separator', () => {
    const el = root('<h2>Capítulo VII<br/>Vasili Smyslov</h2>')
    joinTitleLines(el, ': ')
    expect(el.querySelector('h2')?.textContent).toBe('Capítulo VII: Vasili Smyslov')
  })
})

describe('formatChapterTitle', () => {
  it('re-joins the API title lines with the chosen separator', () => {
    expect(formatChapterTitle('Capítulo dos — Emanuel II', ' - ')).toBe('Capítulo dos - Emanuel II')
    expect(formatChapterTitle('Capítulo dos — Emanuel II', ' · ')).toBe('Capítulo dos · Emanuel II')
    expect(formatChapterTitle('Indice de partidas', ' - ')).toBe('Indice de partidas')
  })
})

describe('hideFensNextToDiagrams', () => {
  it('hides a FEN line right before a diagram and hands its position to the image', () => {
    const el = root(`
      <p style="text-align:center;">Partida 39</p>
      <p class="empty-line"></p>
      <div class="fen">\n    ${FEN}\n  </div>
      <p class="empty-line"></p>
      <p style="text-align:center;"><img alt="" src="x.jpg" /></p>`)
    expect(hideFensNextToDiagrams(el)).toBe(1)
    const fen = el.querySelector('.fen')!
    expect(fen.classList.contains('epub-fen-hidden')).toBe(true)
    expect(fen.getAttribute('aria-hidden')).toBe('true')
    // Hidden, not deleted: the recogniser still reads it.
    expect(fen.textContent?.trim()).toBe(FEN)
    const img = el.querySelector('img')!
    expect(img.getAttribute('data-fen')).toBe(FEN)
    expect(img.getAttribute('data-text-fen')).toBe(FEN)
  })

  it('hides a FEN wrapped in an inner block (<div class="fen"><div variant="1">FEN</div></div>)', () => {
    const el = root(`<p>19 De4</p><div class="fen"><div variant="1">${FEN}</div></div><p><img src="x.jpg"></p>`)
    expect(hideFensNextToDiagrams(el)).toBe(1)
    expect(el.querySelector('.fen')?.classList.contains('epub-fen-hidden')).toBe(true)
    expect(el.querySelector('img')?.getAttribute('data-text-fen')).toBe(FEN)
  })

  it('also hides a FEN line right after a diagram', () => {
    const el = root(`<p><img src="x.jpg"></p><p>${FEN}</p>`)
    expect(hideFensNextToDiagrams(el)).toBe(1)
    expect(el.querySelectorAll('p')[1].classList.contains('epub-fen-hidden')).toBe(true)
    expect(el.querySelector('img')?.getAttribute('data-text-fen')).toBe(FEN)
  })

  it('leaves a FEN without a diagram next to it, and prose next to a diagram, visible', () => {
    const el = root(`<p>${FEN}</p><p>Las blancas juegan.</p><p><img src="x.jpg"></p><p>Texto después del diagrama.</p>`)
    expect(hideFensNextToDiagrams(el)).toBe(0)
    expect(el.querySelector('.epub-fen-hidden')).toBeNull()
    expect(el.querySelector('img')?.hasAttribute('data-text-fen')).toBe(false)
  })
})

describe('prepareChapterHtml', () => {
  const chapter = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title></title>
<style data-epub-stylesheet="1">:where(.epub-content) .fen {display:none}</style></head>
<body><h1>Capítulo dos<br />Emanuel II</h1>
<div class="fen">${FEN}</div>
<p><img alt="" src="../Images/qed_63.jpg" /></p>
<p>1 e4 e5</p></body></html>`

  it('rewrites images, joins the title, hides the FEN and keeps the book stylesheet', () => {
    const out = prepareChapterHtml(chapter, 6, { titleSeparator: ' - ' })
    const el = root(out)
    expect(el.querySelector('style[data-epub-stylesheet]')?.textContent).toContain('.fen {display:none}')
    expect(el.querySelector('h1')?.textContent).toBe('Capítulo dos - Emanuel II')
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/api/library/books/6/images/Images/qed_63.jpg')
    expect(el.querySelector('img')?.getAttribute('data-text-fen')).toBe(FEN)
    expect(el.querySelector('.fen')?.classList.contains('epub-fen-hidden')).toBe(true)
  })

  it('keeps the FEN in the recognition text', () => {
    const text = htmlToProseText(prepareChapterHtml(chapter, 6, { titleSeparator: ' - ' }))
    expect(text).toContain(FEN)
    expect(text).toContain('Capítulo dos - Emanuel II')
    expect(text).toContain('1 e4 e5')
  })

  it('returns an empty chapter unchanged', () => {
    expect(prepareChapterHtml('', 6)).toBe('')
  })
})

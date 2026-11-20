import { describe, it, expect } from 'vitest'
import { applySuggestionsToHtml, chapterBlocks, sanitizeHtml } from './suggestionApply'
import { buildSuggestion, makeAnchor, type Suggestion, type SuggestionKind } from './suggestionFormat'

const HTML = [
  '<h2>Placeholder heading</h2>',
  '<p>Alpha paragraph with some placeholder words in it.</p>',
  '<p>Beta paragraph, also placeholder text for testing.</p>',
  '<p><img src="images/d1.png" alt="diagram"></p>',
  '<p>Gamma closing paragraph.</p>',
].join('')

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html').body

function accepted(kind: SuggestionKind, target: Suggestion['target'], after: unknown): Suggestion {
  return { ...buildSuggestion({ kind, target, before: null, after, author: 'user' }), status: 'accepted' }
}

const anchorOf = (index: number, html = HTML) => makeAnchor(1, index, chapterBlocks(parse(html))[index].textContent ?? '')

describe('chapterBlocks', () => {
  it('lists the outermost block elements in document order', () => {
    const blocks = chapterBlocks(parse('<blockquote><p>a</p></blockquote><ul><li>b<p>c</p></li></ul><p>d</p>'))
    expect(blocks.map((b) => b.tagName)).toEqual(['BLOCKQUOTE', 'LI', 'P'])
  })
})

describe('applySuggestionsToHtml', () => {
  it('replaces the text of the anchored paragraph', () => {
    const s = accepted('text', { book: 'B', chapter: 1, anchor: anchorOf(2) }, 'Beta paragraph, corrected.')
    const out = applySuggestionsToHtml(HTML, [s])
    expect(out.applied).toEqual([s.id])
    expect(out.stale).toEqual([])
    const p = chapterBlocks(parse(out.html))[2]
    expect(p.textContent).toBe('Beta paragraph, corrected.')
    expect(p.tagName).toBe('P')
  })

  it('finds a moved paragraph by its quote, and reports a stale anchor without touching the html', () => {
    const moved = accepted('text', { book: 'B', chapter: 1, anchor: { ...anchorOf(2), blockIndex: 0 } }, 'Moved fix')
    const stale = accepted('text', { book: 'B', chapter: 1, anchor: { chapter: 1, blockIndex: 1, quote: 'Text that is not in the chapter' } }, 'X')
    const out = applySuggestionsToHtml(HTML, [moved, stale])
    expect(out.applied).toEqual([moved.id])
    expect(out.stale).toEqual([stale.id])
    expect(out.html).toContain('Moved fix')
    expect(out.html).toContain('Alpha paragraph')
  })

  it('inserts sanitised html after the anchored block, in creation order', () => {
    const first = accepted('insert', { book: 'B', chapter: 1, anchor: anchorOf(1) }, { html: '<p onclick="x()">First <script>alert(1)</script>added</p>' })
    const second = accepted('insert', { book: 'B', chapter: 1, anchor: anchorOf(1) }, '<p>Second added</p>')
    const out = applySuggestionsToHtml(HTML, [first, second])
    expect(out.applied).toEqual([first.id, second.id])
    const texts = chapterBlocks(parse(out.html)).map((b) => b.textContent)
    expect(texts.slice(1, 4)).toEqual(['Alpha paragraph with some placeholder words in it.', 'First added', 'Second added'])
    expect(out.html).not.toContain('script')
    expect(out.html).not.toContain('onclick')
  })

  it('swaps the src of the target image, refusing unsafe urls', () => {
    const swap = accepted('image', { book: 'B', chapter: 1, image: 'images/d1.png' }, { src: '/api/suggestions/assets/abc.png' })
    let out = applySuggestionsToHtml(HTML, [swap])
    expect(out.applied).toEqual([swap.id])
    expect(parse(out.html).querySelector('img')?.getAttribute('src')).toBe('/api/suggestions/assets/abc.png')

    const evil = accepted('image', { book: 'B', chapter: 1, image: 'images/d1.png' }, { src: 'javascript:alert(1)' })
    out = applySuggestionsToHtml(HTML, [evil])
    expect(out.stale).toEqual([evil.id])
    expect(out.html).not.toContain('javascript:')
  })

  it('matches an image by the end of its path and sets data-fen on it', () => {
    const html = '<p><img src="/api/library/books/3/images/d1.png"></p>'
    const s = accepted('diagram-fen', { book: 'B', chapter: 1, image: 'images/d1.png' }, { fen: '8/8/8/8/8/8/8/K6k w - - 0 1' })
    const out = applySuggestionsToHtml(html, [s])
    expect(out.applied).toEqual([s.id])
    expect(parse(out.html).querySelector('img')?.getAttribute('data-fen')).toBe('8/8/8/8/8/8/8/K6k w - - 0 1')
  })

  it('refuses a malformed FEN and an image that is not in the chapter', () => {
    const bad = accepted('diagram-fen', { book: 'B', chapter: 1, image: 'images/d1.png' }, 'not a fen')
    const missing = accepted('diagram-fen', { book: 'B', chapter: 1, image: 'images/zz.png' }, '8/8/8/8/8/8/8/K6k')
    const out = applySuggestionsToHtml(HTML, [bad, missing])
    expect(out.stale).toEqual([bad.id, missing.id])
    expect(out.html).not.toContain('data-fen')
  })

  it('ignores suggestions that are not accepted or not of an applicable kind', () => {
    const pending = { ...accepted('text', { book: 'B', chapter: 1, anchor: anchorOf(2) }, 'X'), status: 'pending' as const }
    const applied = { ...accepted('text', { book: 'B', chapter: 1, anchor: anchorOf(2) }, 'X'), status: 'applied' as const }
    const comment = accepted('comment', { book: 'B', chapter: 1 }, 'X')
    const out = applySuggestionsToHtml(HTML, [pending, applied, comment])
    expect(out).toEqual({ html: HTML, applied: [], stale: [] })
  })
})

describe('sanitizeHtml', () => {
  it('strips scripts, frames, event handlers and javascript urls', () => {
    const out = sanitizeHtml('<p onmouseover="x()">ok<iframe src="x"></iframe><a href=" javascript:alert(1)">l</a><img src="data:image/png;base64,AAA" onerror="y()"><object data="z"></object><svg><a xlink:href="javascript:1"><text>t</text></a></svg></p>')
    expect(out).toContain('ok')
    expect(out).toContain('data:image/png;base64,AAA')
    for (const bad of ['onmouseover', 'iframe', 'javascript:', 'onerror', '<object']) expect(out).not.toContain(bad)
  })
})

// Regression vectors from the independent verification of T2.
const XSS_VECTORS = [
  '<img src=x onerror=alert(1)>', '<svg><script>alert(1)</script></svg>', '<a href="jAvAscript:alert(1)">x</a>',
  '<a href="&#x6A;avascript:alert(1)">x</a>', '<a href="java&#x09;script:alert(1)">x</a>', '<a href=" &#14;javascript:alert(1)">x</a>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>', '<object data="javascript:alert(1)"></object>',
  '<base href="javascript:/">', '<meta http-equiv=refresh content="0;url=javascript:alert(1)">', '<link rel=import href=x>',
  '<p style="background:url(javascript:alert(1))">x</p>', '<button formaction="javascript:alert(1)">x</button>',
  '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>', '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<svg><animate attributeName=href to=javascript:alert(1) /></svg>', '<svg><set attributeName=onload to=alert(1) /></svg>',
  '<math href="javascript:alert(1)">x</math>', '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
  '<noembed><img title="</noembed><img src=x onerror=alert(1)>"></noembed>', '<xmp><img title="</xmp><img src=x onerror=alert(1)>"></xmp>',
  '<noframes><img title="</noframes><img src=x onerror=alert(1)>"></noframes>', '<svg><noembed><img title="</noembed><img src=x onerror=alert(1)>">',
  '<math><mi><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=1>">',
  '<svg><title><img title="</title><img src=x onerror=alert(1)>"></title></svg>', '<plaintext><img src=x onerror=alert(1)>',
  '<svg><feImage href="javascript:alert(1)"/></svg>', '<img srcset="x 1x, javascript:alert(1) 2x">', '<embed src="javascript:alert(1)">',
  '<svg><use href="data:image/svg+xml,<svg id=x onload=alert(1)>#x"/></svg>', '<details open ontoggle=alert(1)>', '<a href="vbscript:msgbox(1)">x</a>',
  '<svg><foreignObject><iframe src=javascript:alert(1)></iframe></foreignObject></svg>', '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
]

/** What is still dangerous once the HTML is parsed into a live document (twice, to catch mutation). */
function dangers(html: string): string[] {
  const out: string[] = []
  let cur = html
  for (let round = 0; round < 2; round++) {
    const d = document.createElement('div')
    d.innerHTML = cur
    d.querySelectorAll('script, iframe, object, embed, base, meta, link, frame, form').forEach((e) => out.push(`<${e.tagName}>`))
    d.querySelectorAll('*').forEach((e) => {
      for (const a of Array.from(e.attributes)) {
        const n = a.name.toLowerCase()
        // eslint-disable-next-line no-control-regex
        const v = a.value.replace(/[\s\u0000-\u001f]/g, '').toLowerCase()
        if (n.startsWith('on') || n === 'srcdoc' || /^(javascript|vbscript|data:text)/.test(v) || (n === 'style' && /url\(|expression/.test(v))) out.push(`${e.tagName}[${n}]`)
      }
    })
    cur = d.innerHTML
  }
  return out
}

describe('sanitizeHtml regression vectors', () => {
  const base = '<p>Hello world paragraph</p><table><tr><td>cell text</td></tr></table><pre>pre block</pre>'
  const targets = [['text', 0, 'Hello world paragraph'], ['insert', 0, 'Hello world paragraph'], ['text', 1, 'cell text'], ['text', 2, 'pre block'], ['insert', 2, 'pre block']] as const
  for (const v of XSS_VECTORS) {
    it(`neutralises ${v}`, () => {
      const s = sanitizeHtml(v)
      expect(dangers(s), s).toEqual([])
      for (const [kind, blockIndex, quote] of targets) {
        const sug = accepted(kind, { book: 'B', chapter: 1, anchor: { chapter: 1, blockIndex, quote } }, { html: v })
        const r = applySuggestionsToHtml(base, [sug])
        expect(dangers(r.html), `${kind}/${quote}: ${r.html}`).toEqual([])
      }
    })
  }
})

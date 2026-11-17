import { describe, it, expect } from 'vitest'
import { exportAnnotated, parseAnnotated } from './annotatedExport'

const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'
const TEXT = [
  'Ana – Beto',
  'Precisión: blancas 80%, negras 40%.',
  '1. e4 e5 2. Dh5 Cc6 3. Ac4 Cf6??',
  'Error grave: pierde la partida.',
  '(3... g6 4. Df3 Cf6)',
  `[Diagram fen="${FEN}" eval="Evaluación: −5.0 (ventaja de las blancas)"]`,
  '4. Dxf7#',
].join('\n')
const dec = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('the annotated game, downloaded (S34)', () => {
  it('reads the book layout: title, moves, remarks, variations and diagrams', () => {
    const doc = parseAnnotated(TEXT)
    expect(doc.title).toBe('Ana – Beto')
    expect(doc.blocks.map((b) => b.kind)).toEqual(['text', 'moves', 'text', 'variation', 'diagram', 'moves'])
    expect(doc.blocks[4]).toMatchObject({ kind: 'diagram', fen: FEN, eval: 'Evaluación: −5.0 (ventaja de las blancas)' })
  })
  it('Markdown: moves in bold, remarks as paragraphs, the diagram as an image with its evaluation', () => {
    const md = new TextDecoder().decode(exportAnnotated(TEXT, 'md').data)
    expect(md).toContain('# Ana – Beto')
    expect(md).toContain('**1. e4 e5 2. Dh5 Cc6 3. Ac4 Cf6??**')
    expect(md).toContain('Error grave: pierde la partida.')
    expect(md).toContain('*(3... g6 4. Df3 Cf6)*')
    expect(md).toMatch(/!\[Diagram\]\(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+\)/)
    expect(md).toContain('*Evaluación: −5.0 (ventaja de las blancas)*')
  })
  it('HTML: one page, the diagram drawn inline', () => {
    const out = exportAnnotated(TEXT, 'html')
    const html = new TextDecoder().decode(out.data)
    expect(out).toMatchObject({ mime: 'text/html', extension: 'html' })
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<title>Ana – Beto</title>')
    expect(html).toContain('<p class="moves">1. e4 e5 2. Dh5 Cc6 3. Ac4 Cf6??</p>')
    expect(html).toContain('<svg')
    expect(html).toContain('<p class="eval">Evaluación: −5.0 (ventaja de las blancas)</p>')
  })
  it('EPUB: a zip whose first entry is the uncompressed mimetype, with the chapter and the package', () => {
    const out = exportAnnotated(TEXT, 'epub')
    expect(out).toMatchObject({ mime: 'application/epub+zip', extension: 'epub' })
    const s = dec(out.data)
    expect(s.slice(0, 2)).toBe('PK')
    expect(s.slice(30, 38)).toBe('mimetype')
    expect(s.slice(38, 58)).toBe('application/epub+zip')
    expect(s).toContain('META-INF/container.xml')
    expect(s).toContain('OEBPS/content.opf')
    expect(s).toContain('OEBPS/game.xhtml')
    expect(s).toContain('<svg')
  })
  it('PDF: a valid file (header, objects, cross-reference table) with the text and a drawn board', () => {
    const out = exportAnnotated(TEXT, 'pdf')
    expect(out).toMatchObject({ mime: 'application/pdf', extension: 'pdf' })
    const s = dec(out.data)
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    const startxref = Number(/startxref\s+(\d+)/.exec(s)![1])
    expect(s.slice(startxref, startxref + 4)).toBe('xref')
    expect(s).toContain('(1. e4 e5 2. Dh5 Cc6 3. Ac4 Cf6??) Tj')
    expect(s).toMatch(/re f/) // squares of the diagram
  })
})

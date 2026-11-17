import { boardSvg } from '../../utils/boardSvg'
import { parseCommentMark, parseDiagramMark } from '../../utils/diagramMark'

/**
 * The annotated game (the text annotateGame writes, book layout) as a file to
 * keep: Markdown, HTML, EPUB or PDF. Everything is built here, in the browser,
 * with no library: the EPUB is a stored (uncompressed) zip, the PDF a small
 * hand-written file with the standard Helvetica font and the diagrams drawn.
 */
export type ExportFormat = 'md' | 'html' | 'epub' | 'pdf'

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'moves'; text: string }
  | { kind: 'variation'; text: string }
  | { kind: 'diagram'; fen: string; eval?: string; line?: string; alt?: string }
  | { kind: 'quote'; text: string; source: string }

export interface AnnotatedDoc { title: string; blocks: Block[] }


/** Lines of the annotated text: the title, then moves, remarks, variations and diagrams. */
export function parseAnnotated(text: string): AnnotatedDoc {
  const [title = '', ...rest] = text.split('\n')
  const blocks: Block[] = []
  for (const raw of rest) {
    const line = raw.trim()
    if (!line) continue
    const d = parseDiagramMark(line)
    const q = d ? null : parseCommentMark(line)
    if (d) blocks.push({ kind: 'diagram', ...d })
    else if (q) blocks.push({ kind: 'quote', ...q })
    else if (/^\d+\.(\.\.)?\s/.test(line)) blocks.push({ kind: 'moves', text: line })
    else if (line.startsWith('(')) blocks.push({ kind: 'variation', text: line })
    else blocks.push({ kind: 'text', text: line })
  }
  return { title: title.trim() || 'Annotated game', blocks }
}

const MIME: Record<ExportFormat, string> = { md: 'text/markdown', html: 'text/html', epub: 'application/epub+zip', pdf: 'application/pdf' }

export function exportAnnotated(text: string, format: ExportFormat, lang: 'es' | 'en' | 'de' = 'en'): { data: Uint8Array; mime: string; extension: ExportFormat } {
  const doc = parseAnnotated(text)
  const enc = new TextEncoder()
  const data = format === 'md' ? enc.encode(toMarkdown(doc))
    : format === 'html' ? enc.encode(toHtml(doc))
    : format === 'epub' ? toEpub(doc)
    : toPdf(doc, lang)
  return { data, mime: MIME[format], extension: format }
}

/** Save the file in the browser (a download of `<title>.<ext>`). */
export function downloadAnnotated(text: string, format: ExportFormat, title: string, lang: 'es' | 'en' | 'de' = 'en'): void {
  const out = exportAnnotated(text, format, lang)
  const url = URL.createObjectURL(new Blob([out.data as BlobPart], { type: out.mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'annotated-game'}.${out.extension}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Markdown and HTML ────────────────────────────────────────────────────────

const base64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function toMarkdown(doc: AnnotatedDoc): string {
  const out = [`# ${doc.title}`, '']
  for (const b of doc.blocks) {
    if (b.kind === 'moves') out.push(`**${b.text}**`, '')
    else if (b.kind === 'variation') out.push(`*${b.text}*`, '')
    else if (b.kind === 'text') out.push(b.text, '')
    else if (b.kind === 'quote') out.push(`> ${b.text}${b.source ? `\n> — ${b.source}` : ''}`, '')
    else {
      out.push(`![Diagram](data:image/svg+xml;base64,${base64(boardSvg(b.fen, 280))})`, '')
      if (b.eval) out.push(`*${b.eval}*`, '')
      if (b.line) out.push(b.line, '')
      if (b.alt) out.push(b.alt, '')
    }
  }
  return out.join('\n')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function bodyHtml(doc: AnnotatedDoc): string {
  return doc.blocks.map((b) => {
    if (b.kind === 'moves') return `<p class="moves">${esc(b.text)}</p>`
    if (b.kind === 'variation') return `<p class="variation">${esc(b.text)}</p>`
    if (b.kind === 'text') return `<p>${esc(b.text)}</p>`
    if (b.kind === 'quote') return `<blockquote><p>${esc(b.text)}</p>${b.source ? `<p class="source">— ${esc(b.source)}</p>` : ''}</blockquote>`
    return `<figure class="diagram">${boardSvg(b.fen, 280)}</figure>${b.eval ? `<p class="eval">${esc(b.eval)}</p>` : ''}`
      + (b.line ? `<p class="eval line">${esc(b.line)}</p>` : '') + (b.alt ? `<p class="eval line">${esc(b.alt)}</p>` : '')
  }).join('\n')
}

const STYLE = 'body{font-family:Georgia,serif;max-width:40em;margin:2em auto;padding:0 1em;line-height:1.5;color:#222;background:#fff}'
  + 'h1{font-size:1.4em}.moves{font-weight:bold}.variation{font-style:italic;color:#444}'
  + '.diagram{margin:1em 0 .2em;text-align:center}blockquote{margin:.6em 1.5em;color:#334155;font-style:italic}.source{font-style:normal;font-size:.85em;color:#64748b}.eval{text-align:center;font-size:.9em;color:#555;margin-top:0}'

function toHtml(doc: AnnotatedDoc): string {
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.title)}</title><style>${STYLE}</style></head>\n<body>\n<h1>${esc(doc.title)}</h1>\n${bodyHtml(doc)}\n</body></html>\n`
}

// ── EPUB (a zip with no compression) ─────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A zip of stored entries, in order (an EPUB needs "mimetype" first and uncompressed). */
export function storedZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0, true); local.setUint16(8, 0, true)
    local.setUint16(10, 0, true); local.setUint16(12, 0x21, true); local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true); local.setUint32(22, f.data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true)
    chunks.push(new Uint8Array(local.buffer), name, f.data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0, true); c.setUint16(10, 0, true)
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true)
    c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true)
    c.setUint32(38, 0, true); c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), name)
    offset += 30 + name.length + f.data.length
  }
  const size = central.reduce((n, x) => n + x.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, size, true); end.setUint32(16, offset, true)
  return concat([...chunks, ...central, new Uint8Array(end.buffer)])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

function toEpub(doc: AnnotatedDoc): Uint8Array {
  const enc = new TextEncoder()
  const id = `urn:uuid:chess-reader-${crc32(enc.encode(doc.title + doc.blocks.length)).toString(16)}`
  const title = esc(doc.title)
  const xhtml = `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8"/><title>${title}</title><style>${STYLE}</style></head>\n<body>\n<h1>${title}</h1>\n${bodyHtml(doc).replace(/<br>/g, '<br/>')}\n</body></html>\n`
  const opf = `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${id}</dc:identifier><dc:title>${title}</dc:title><dc:language>und</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata>`
    + '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="game" href="game.xhtml" media-type="application/xhtml+xml" properties="svg"/></manifest><spine><itemref idref="game"/></spine></package>\n'
  const nav = `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title></head><body><nav epub:type="toc"><ol><li><a href="game.xhtml">${title}</a></li></ol></nav></body></html>\n`
  const container = '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n'
  return storedZip([
    { name: 'mimetype', data: enc.encode('application/epub+zip') },
    { name: 'META-INF/container.xml', data: enc.encode(container) },
    { name: 'OEBPS/content.opf', data: enc.encode(opf) },
    { name: 'OEBPS/nav.xhtml', data: enc.encode(nav) },
    { name: 'OEBPS/game.xhtml', data: enc.encode(xhtml) },
  ])
}

// ── PDF (Helvetica, WinAnsi text, diagrams drawn as squares and pieces) ──────

/** WinAnsi (cp1252) byte of a character, or "?" when the font has no such letter. */
const CP1252: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 }
function pdfString(s: string): string {
  let out = ''
  for (const ch of s.replace(/−/g, '-')) {
    const code = ch.charCodeAt(0)
    const byte = CP1252[ch] ?? (code < 256 ? code : 63)
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`
    else if (byte < 32 || byte > 126) out += `\\${byte.toString(8).padStart(3, '0')}`
    else out += String.fromCharCode(byte)
  }
  return out
}

/** Break a paragraph into lines of at most `width` characters (Helvetica, roughly). */
function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) { lines.push(line); line = word } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines
}

const PAGE = { w: 595, h: 842, margin: 56 }
/** Piece letters of the diagram, in the language of the text (the PDF font has no chess figures). */
const PIECE_LETTERS: Record<'es' | 'en' | 'de', Record<string, string>> = {
  en: { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' },
  es: { k: 'R', q: 'D', r: 'T', b: 'A', n: 'C', p: 'P' },
  de: { k: 'K', q: 'D', r: 'T', b: 'L', n: 'S', p: 'B' },
}

function diagramOps(fen: string, x0: number, yTop: number, cell: number, letters: Record<string, string>): string {
  const ops: string[] = []
  const rows = fen.split(' ')[0].split('/')
  for (let r = 0; r < 8; r++) {
    let f = 0
    for (const ch of rows[r] ?? '') {
      const n = /\d/.test(ch) ? Number(ch) : 1
      for (let k = 0; k < n; k++, f++) {
        const x = x0 + f * cell
        const y = yTop - (r + 1) * cell
        ops.push(`${(r + f) % 2 ? '0.62 0.71 0.55' : '0.93 0.93 0.82'} rg ${x} ${y} ${cell} ${cell} re f`)
        if (n === 1 && !/\d/.test(ch)) {
          const white = ch === ch.toUpperCase()
          const cx = x + cell / 2
          const cy = y + cell / 2
          const rr = cell * 0.38
          // A disc (four Bézier arcs) with the piece letter: white pieces light, black dark.
          const c = rr * 0.5523
          ops.push(`${white ? '1 1 1' : '0.1 0.1 0.1'} rg 0 0 0 RG 0.8 w ${cx + rr} ${cy} m ${cx + rr} ${cy + c} ${cx + c} ${cy + rr} ${cx} ${cy + rr} c ${cx - c} ${cy + rr} ${cx - rr} ${cy + c} ${cx - rr} ${cy} c ${cx - rr} ${cy - c} ${cx - c} ${cy - rr} ${cx} ${cy - rr} c ${cx + c} ${cy - rr} ${cx + rr} ${cy - c} ${cx + rr} ${cy} c B`)
          ops.push(`BT /F2 ${cell * 0.45} Tf ${white ? '0 0 0' : '1 1 1'} rg ${cx - cell * 0.15} ${cy - cell * 0.16} Td (${letters[ch.toLowerCase()]}) Tj ET`)
        }
      }
    }
  }
  ops.push(`0 0 0 RG 1 w ${x0} ${yTop - 8 * cell} ${8 * cell} ${8 * cell} re S`)
  return ops.join('\n')
}

function toPdf(doc: AnnotatedDoc, lang: 'es' | 'en' | 'de'): Uint8Array {
  const pages: string[] = []
  let ops: string[] = []
  let y = PAGE.h - PAGE.margin
  const newPage = () => { pages.push(ops.join('\n')); ops = []; y = PAGE.h - PAGE.margin }
  const text = (s: string, font: 'F1' | 'F2' | 'F3', size: number, gap: number, center = false) => {
    for (const line of wrap(s, Math.floor((PAGE.w - 2 * PAGE.margin) / (size * 0.5)))) {
      if (y - size < PAGE.margin) newPage()
      y -= size * 1.35
      const x = center ? Math.max(PAGE.margin, (PAGE.w - line.length * size * 0.5) / 2) : PAGE.margin
      ops.push(`BT /${font} ${size} Tf 0 0 0 rg ${x} ${y} Td (${pdfString(line)}) Tj ET`)
    }
    y -= gap
  }
  text(doc.title, 'F2', 16, 8)
  for (const b of doc.blocks) {
    if (b.kind === 'diagram') {
      const cell = 22
      if (y - 8 * cell - 30 < PAGE.margin) newPage()
      ops.push(diagramOps(b.fen, (PAGE.w - 8 * cell) / 2, y - 6, cell, PIECE_LETTERS[lang]))
      y -= 8 * cell + 10
      if (b.eval) text(b.eval, 'F3', 9.5, 2, true)
      if (b.line) text(b.line, 'F1', 9.5, 2, true)
      if (b.alt) text(b.alt, 'F1', 9, 2, true)
      y -= 4
    } else if (b.kind === 'quote') {
      text(b.text, 'F3', 10.5, 2)
      if (b.source) text(`— ${b.source}`, 'F1', 9, 5)
    } else {
      text(b.text, b.kind === 'moves' ? 'F2' : b.kind === 'variation' ? 'F3' : 'F1', 11, 5)
    }
  }
  newPage()

  // Objects: 1 catalog, 2 pages, 3-5 fonts, then a page and its content per page.
  const objs: string[] = []
  const kids = pages.map((_, i) => `${6 + i * 2} 0 R`).join(' ')
  objs.push('<< /Type /Catalog /Pages 2 0 R >>')
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  for (const name of ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique']) objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`)
  pages.forEach((content, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${7 + i * 2} 0 R >>`)
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  // Every character above is one byte (pdfString escaped the rest).
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
  return bytes
}

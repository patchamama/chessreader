/**
 * A small Markdown to HTML converter for the reader's edit mode (S8): headings,
 * paragraphs, bold and italic, inline code, inline HTML tags, lists, tables, links (http and
 * https only) and images (http, https or a PNG/JPEG/WebP data URL). Text is
 * escaped; raw HTML blocks are passed through, so the result must always go
 * through sanitizeHtml before it reaches a chapter.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const HTTP = /^https?:\/\/[^\s"'<>]+$/i
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i

/** One line of text with its inline Markdown turned into HTML. */
function inline(text: string): string {
  const kept: string[] = []
  const keep = (html: string) => `\u0000${kept.push(html) - 1}\u0000`
  let out = text
    .replace(/`([^`]+)`/g, (_, code: string) => keep(`<code>${esc(code)}</code>`))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (all, alt: string, url: string) =>
      HTTP.test(url) || DATA_IMAGE.test(url) ? keep(`<img src="${esc(url)}" alt="${esc(alt)}">`) : keep(esc(all)))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label: string, url: string) =>
      HTTP.test(url) ? keep(`<a href="${esc(url)}">${emphasis(esc(label))}</a>`) : keep(esc(all)))
    // Inline HTML tags are kept as written (the sanitiser decides what stays).
    .replace(/<\/?[a-zA-Z][^<>]*>/g, (tag) => keep(tag))
  out = emphasis(esc(out))
  // eslint-disable-next-line no-control-regex
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[Number(i)])
}

function emphasis(html: string): string {
  return html
    .replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)([^*]+?)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(?=\S)([^_]+?)_(?!\w)/g, '$1<em>$2</em>')
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const UL = /^\s*[-*+]\s+(.*)$/
const OL = /^\s*\d+[.)]\s+(.*)$/
const RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/
const RAW = /^\s*<\/?[a-zA-Z]/

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

/** Markdown (with optional raw HTML blocks) as HTML; not yet sanitised. */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: string[] = []
  let i = 0
  const startsBlock = (line: string) => HEADING.test(line) || UL.test(line) || OL.test(line) || RAW.test(line)
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const heading = HEADING.exec(line)
    if (heading) {
      const n = heading[1].length
      blocks.push(`<h${n}>${inline(heading[2])}</h${n}>`)
      i++
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && RULE.test(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]))
      const th = head.map((c) => `<th>${inline(c)}</th>`).join('')
      const body = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
      blocks.push(`<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`)
      continue
    }
    const list = UL.test(line) ? UL : OL.test(line) ? OL : null
    if (list) {
      const items: string[] = []
      let m: RegExpExecArray | null
      while (i < lines.length && (m = list.exec(lines[i]))) { items.push(`<li>${inline(m[1])}</li>`); i++ }
      const tag = list === UL ? 'ul' : 'ol'
      blocks.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }
    if (RAW.test(line)) {
      const raw: string[] = []
      while (i < lines.length && lines[i].trim()) raw.push(lines[i++])
      blocks.push(raw.join('\n'))
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines[i]))) para.push(lines[i++])
    blocks.push(`<p>${para.map(inline).join('\n')}</p>`)
  }
  return blocks.join('\n')
}

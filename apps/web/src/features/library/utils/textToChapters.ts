import { pgnToChapters } from '../../gamesearch/pgnChapters'
import type { Chapter } from '../api/libraryApi'
import { boardSvgDataUrl } from './boardSvg'
import { parseDiagramMark } from './diagramMark'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Pasted text as a book the reader can open: PGN (tag pairs) becomes one
 * chapter per game; anything else is one chapter, one paragraph per line or
 * block — the same shape the recogniser reads from an EPUB.
 */
export function textToChapters(text: string, title?: string): { title: string; chapters: Chapter[] } {
  const clean = text.replace(/\r/g, '').trim()
  if (!clean) return { title: title?.trim() || '', chapters: [] }
  if (/^\[\w+ "[^"]*"\]/m.test(clean)) {
    const { chapters } = pgnToChapters(clean)
    if (chapters.length > 0) return { title: title?.trim() || chapters[0].title, chapters }
  }
  const paragraphs = clean.split(/\n+/).map((p) => p.trim()).filter(Boolean)
  const name = title?.trim() || paragraphs[0].slice(0, 80)
  const html = paragraphs.map(paragraph).join('\n')
  return { title: name, chapters: [{ title: name, html, toc: [{ order: 1, title: name }] }] }
}

/**
 * A diagram mark written by the commentary (`[Diagram fen="…" eval="…" line="…" alt="…"]`)
 * or a plain paragraph. The engine's lines under a diagram are marked so the
 * recogniser does not read them as moves of the game.
 */
function paragraph(p: string): string {
  const mark = parseDiagramMark(p)
  if (!mark) return `<p>${esc(p)}</p>`
  const out = [`<img class="diagram" src="${boardSvgDataUrl(mark.fen)}" alt="Diagram" data-fen="${esc(mark.fen)}">`]
  if (mark.eval) out.push(`<p class="diagram-eval">${esc(mark.eval)}</p>`)
  if (mark.line) out.push(`<p class="diagram-line" data-no-recognition>${esc(mark.line)}</p>`)
  if (mark.alt) out.push(`<p class="diagram-line diagram-alt" data-no-recognition>${esc(mark.alt)}</p>`)
  return out.join('\n')
}

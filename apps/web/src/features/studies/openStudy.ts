import { EXTERNAL_BOOK_ID, useExternalBookStore, type ExternalChapter } from '../../shared/externalBook/externalBookStore'
import { saveProgress } from '../library/store/readingStore'
import { pgnToChapters } from '../gamesearch/pgnChapters'

export type OpenMode = 'continuous' | 'per-game'
export interface StudyPart { name: string; pgn: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Assemble a study (or the ordered parts of a book made of linked studies) as
 * reader chapters. Each game is rendered by pgnToChapters, as commented games
 * are everywhere else: a heading from ChapterName, then its moves and comments.
 * "continuous" puts every game one after another in a single chapter (with a
 * heading per part when there are several); "per-game" makes one chapter per
 * study chapter (prefixed with the part name when there are several parts).
 */
export function buildStudyBook(parts: StudyPart[], mode: OpenMode, title?: string): { title: string; chapters: ExternalChapter[] } {
  const many = parts.length > 1
  const bookTitle = title ?? parts[0]?.name ?? 'Study'
  const perPart = parts.map((p) => ({ part: p, chapters: pgnToChapters(p.pgn, { fromPosition: true }).chapters }))
  if (!perPart.some((p) => p.chapters.length)) throw new Error('This study has no games to show')

  if (mode === 'continuous') {
    const html = perPart.filter((p) => p.chapters.length).map(({ part, chapters }) =>
      [many ? `<h1>${esc(part.name)}</h1>` : '', ...chapters.map((c) => c.html)].filter(Boolean).join('\n')).join('\n')
    return { title: bookTitle, chapters: [{ title: bookTitle, html, toc: [{ order: 1, title: bookTitle }] }] }
  }

  const all = perPart.flatMap(({ part, chapters }) => chapters.map((c) => many
    ? { title: `${part.name}: ${c.title}`, html: c.html.replace(`<h2>${esc(c.title)}</h2>`, `<h2>${esc(`${part.name}: ${c.title}`)}</h2>`) }
    : { title: c.title, html: c.html }))
  const toc = all.map((c, i) => ({ order: i + 1, title: c.title }))
  return { title: bookTitle, chapters: all.map((c) => ({ ...c, toc })) }
}

/** Put the assembled book in the reader's external book; resolves to the route to go to. */
export function openStudyBook(parts: StudyPart[], mode: OpenMode, title?: string): string {
  const b = buildStudyBook(parts, mode, title)
  saveProgress(EXTERNAL_BOOK_ID, 1)
  useExternalBookStore.getState().open(b.title, b.chapters)
  return `/read/${EXTERNAL_BOOK_ID}`
}

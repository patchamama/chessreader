// Where a trap is in its book's text, so the app can open the book there.

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * The chapter (the reader's numbering: the non-empty form-feed parts of
 * books/text/<id>.txt, from 1) whose text holds the title, or null.
 */
export function chapterOfTitle(text, title) {
  const want = norm(title)
  const chapters = text.replace(/\r/g, '').split('\f').map((p) => p.trim()).filter(Boolean)
  const i = chapters.findIndex((c) => norm(c).includes(want))
  return i < 0 ? null : i + 1
}

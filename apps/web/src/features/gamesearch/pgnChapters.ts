import type { Chapter } from '../library/api/libraryApi'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Turn a PGN file (one or many games) into reader chapters, one per game. The
 * movetext is kept in PGN style — comments in braces, variations in
 * parentheses — which the recogniser reads directly. Engine and clock tags
 * inside comments are dropped. Games that do not start from the initial
 * position (puzzles with a FEN) are skipped: the reader replays games from
 * move 1.
 */
export function pgnToChapters(pgn: string): { chapters: Chapter[]; skipped: number } {
  const games = pgn.replace(/\r/g, '').split(/\n\n(?=\[)/).map((g) => g.trim()).filter(Boolean)
  const parsed: { title: string; html: string }[] = []
  let skipped = 0
  for (const game of games) {
    const split = game.indexOf('\n\n')
    const header = split >= 0 ? game.slice(0, split) : game
    const movetext = split >= 0 ? game.slice(split + 2) : ''
    const tag = (name: string) => new RegExp(`\\[${name} "([^"]*)"\\]`).exec(header)?.[1] ?? ''
    if (tag('FEN') || !/\d+\./.test(movetext)) { skipped++; continue }
    const players = [tag('White'), tag('Black')].filter((p) => p && p !== '?').join(' — ')
    const title = tag('ChapterName') || players || tag('Event') || 'Game'
    const where = [tag('Event'), tag('Site'), tag('Date').replace(/\.\?\?/g, '')]
      .filter((v) => v && v !== '?' && !/^https?:/.test(v)).join(', ')
    const moves = movetext
      .replace(/\[%[^\]]*\]/g, '')
      .replace(/\{\s*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    parsed.push({
      title,
      html: [
        `<h2>${esc(title)}</h2>`,
        players || where ? `<p><em>${esc([players, where].filter(Boolean).join(', '))}</em></p>` : '',
        `<p>${esc(moves)}</p>`,
      ].join('\n'),
    })
  }
  const toc = parsed.map((p, i) => ({ order: i + 1, title: p.title }))
  return { chapters: parsed.map((p) => ({ title: p.title, html: p.html, toc })), skipped }
}

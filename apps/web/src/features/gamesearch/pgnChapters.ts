import type { Chapter } from '../library/api/libraryApi'
import { bracesToParagraphs } from '../library/utils/commentLayout'
import { boardSvgDataUrl } from '../library/utils/boardSvg'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Turn a PGN file (one or many games) into reader chapters, one per game. The
 * movetext is kept in PGN style — comments in braces, variations in
 * parentheses — and then laid out as books print them: the comments of the main
 * line as paragraphs after their move, the comments of a variation inside it, on
 * its line (see bracesToParagraphs). Engine and clock tags inside comments are dropped. Games that start from a position (a FEN tag)
 * are skipped — studies full of puzzles are not games to replay — unless
 * `fromPosition` is set (a book fragment from the game database): then the
 * position is shown as a diagram with its FEN line right after it (the reader
 * hides that line and offers the FEN from the diagram, as in the books) and the
 * reader starts the game there.
 */
export function pgnToChapters(pgn: string, { fromPosition = false }: { fromPosition?: boolean } = {}): { chapters: Chapter[]; skipped: number } {
  const games = pgn.replace(/\r/g, '').split(/\n\n(?=\[)/).map((g) => g.trim()).filter(Boolean)
  const parsed: { title: string; html: string }[] = []
  let skipped = 0
  for (const game of games) {
    const split = game.indexOf('\n\n')
    const header = split >= 0 ? game.slice(0, split) : game
    const movetext = split >= 0 ? game.slice(split + 2) : ''
    const tag = (name: string) => new RegExp(`\\[${name} "([^"]*)"\\]`).exec(header)?.[1] ?? ''
    const fen = tag('FEN').trim()
    if ((fen && !fromPosition) || !/\d+\./.test(movetext)) { skipped++; continue }
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
        fen ? `<img class="diagram" src="${boardSvgDataUrl(fen)}" alt="Diagram" data-fen="${esc(fen).replace(/"/g, '&quot;')}">` : '',
        fen ? `<p>${esc(fen)}</p>` : '',
        ...bracesToParagraphs(moves).split('\n').map((line) => `<p>${esc(line)}</p>`),
      ].join('\n'),
    })
  }
  const toc = parsed.map((p, i) => ({ order: i + 1, title: p.title }))
  return { chapters: parsed.map((p) => ({ title: p.title, html: p.html, toc })), skipped }
}

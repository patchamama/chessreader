import { DIAGRAM_MARK, extractPlayers, recognizeGames, treeToPgn } from '@chess-ebook/chess-shared'
import type { GameNode, GameTree, RecognizedGame } from '@chess-ebook/chess-shared'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const RESULT_AT_END = /(?:^|\s)(1-0|0-1|1\/2-1\/2|½-½|\*)\s*$/
const RESULT_AT_START = /^\s*(1-0|0-1|1\/2-1\/2|½-½|\*)(?=\s|$)/

export interface BookInfo { title: string; author?: string | null }
export interface GameContext { book: BookInfo; chapter: number; chapterTitle: string; gameIndex: number }
/** A game ready to keep: the fields the generated-PGN area stores, with the PGN text. */
export interface GeneratedGame {
  chapter: number
  gameIndex: number
  white: string
  black: string
  event: string
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  pgn: string
}

/** A header value on one line, with no quote or backslash that would break the tag. */
export function escapeTag(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/"/g, "'").replace(/\\/g, '').trim()
}

/**
 * Book prose as the text of a PGN comment: no braces (they would close it), no
 * parentheses (variation brackets of the source), no diagram marks, no move
 * number left over from the next move, and no result token.
 */
export function cleanComment(raw: string): string {
  return raw
    .replaceAll(DIAGRAM_MARK, ' ')
    .replace(/[{}()]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:^|\s)\d+\s*\.{1,3}\s*$/, '')
    .replace(/^\s*\d+\s*\.{1,3}(?=\s)/, '')
    .replace(RESULT_AT_END, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const normaliseResult = (r: string): GeneratedGame['result'] => (r === '½-½' ? '1/2-1/2' : r) as GeneratedGame['result']

/** The result written at the end of the game or right after it. */
function readResult(game: RecognizedGame, text: string): GeneratedGame['result'] {
  const inside = RESULT_AT_END.exec(game.source)
  if (inside) return normaliseResult(inside[1])
  const after = RESULT_AT_START.exec(text.slice(game.charEnd, game.charEnd + 16))
  return after ? normaliseResult(after[1]) : '*'
}

/** Header facts the text before the game says: tags or labels, else the players' line. */
function readHeading(heading: string): { white: string; black: string; event: string; site: string; date: string } {
  const tag = (names: string) => new RegExp(`(?:\\[(?:${names}) "([^"]+)"\\]|^\\s*(?:${names})\\s*:\\s*(.+)$)`, 'mi').exec(heading)
  const read = (names: string) => { const m = tag(names); return (m?.[1] ?? m?.[2] ?? '').trim().replace(/[.;]+$/, '') }
  const players = extractPlayers(heading.slice(-300))
  // The year written on the players' line (or the nearest line with one) is the date.
  const year = /\b(1[5-9]\d\d|20\d\d)\b/.exec(heading.split('\n').filter((l) => l.trim()).reverse().find((l) => /\b(1[5-9]\d\d|20\d\d)\b/.test(l)) ?? '')?.[1]
  const date = read('Date|Fecha') || (year ? `${year}.??.??` : '')
  return { white: players.white ?? '', black: players.black ?? '', event: read('Event|Evento|Torneo'), site: read('Site|Lugar|Sitio'), date }
}

/** The moves of a line up to the first one the engine rejected (the PGN must stay playable). */
function playable(ids: string[], nodes: Map<string, GameNode>): string[] {
  const end = ids.findIndex((id) => nodes.get(id)?.invalid)
  return end < 0 ? ids : ids.slice(0, end)
}

/**
 * The prose after each placed move, up to the next one: it becomes that move's
 * comment. Text after the ")" that closes a variation belongs to the main-line
 * move the variation hangs off.
 */
function commentsOf(game: RecognizedGame): Map<string, string> {
  const main = new Set(game.tree.mainline)
  const placed = [...game.tree.nodes.values()]
    .filter((n) => n.charStart !== undefined && n.charEnd !== undefined && !n.invalid)
    .sort((a, b) => a.charStart! - b.charStart!)
  const out = new Map<string, string[]>()
  const add = (id: string, text: string) => {
    const clean = cleanComment(text)
    if (clean) out.set(id, [...(out.get(id) ?? []), clean])
  }
  let lastMain: GameNode | null = null
  placed.forEach((node, i) => {
    if (main.has(node.id)) lastMain = node
    const from = node.charEnd! - game.charStart
    const to = (placed[i + 1]?.charStart ?? game.charEnd) - game.charStart
    const gap = game.source.slice(from, to)
    const close = gap.lastIndexOf(')')
    if (close >= 0 && lastMain && lastMain !== node) {
      add(node.id, gap.slice(0, close))
      add(lastMain.id, gap.slice(close + 1))
    } else add(node.id, gap)
  })
  return new Map([...out].map(([id, parts]) => [id, parts.join(' ')]))
}

/** The tree with every comment written after its move (serialised by treeToPgn through `rawSan`). */
function treeWithComments(tree: GameTree, comments: Map<string, string>): GameTree {
  const nodes = new Map<string, GameNode>()
  for (const [id, node] of tree.nodes) {
    const comment = comments.get(id)
    nodes.set(id, { ...node, rawSan: comment ? `${node.san} {${comment}}` : node.san })
  }
  const variations = new Map<string, string[][]>()
  for (const [key, lines] of tree.variations) variations.set(key, lines.map((l) => playable(l, tree.nodes)).filter((l) => l.length > 0))
  return { ...tree, nodes, mainline: playable(tree.mainline, tree.nodes), variations }
}

/**
 * One recognised game as a commented PGN: headers read from the text before it
 * (players, date, event, site), the book as Source, the moves with the book's
 * prose as {comments}. `text` is the chapter text the games were recognised on.
 */
export function buildGamePgn(game: RecognizedGame, text: string, ctx: GameContext, previousEnd = 0): GeneratedGame {
  const heading = readHeading(text.slice(Math.max(previousEnd, game.charStart - 600), game.charStart))
  const result = readResult(game, text)
  const event = heading.event || ctx.chapterTitle || ctx.book.title
  const source = [ctx.book.title, ctx.book.author, `chapter ${ctx.chapter}${ctx.chapterTitle ? `: ${ctx.chapterTitle}` : ''}`].filter(Boolean).join(', ')
  const tags: [string, string][] = [
    ['Event', event], ['Site', heading.site || '?'], ['Date', heading.date || '????.??.??'], ['Round', '?'],
    ['White', heading.white || '?'], ['Black', heading.black || '?'], ['Result', result], ['Source', source],
  ]
  if (game.tree.startFen !== START_FEN) tags.push(['SetUp', '1'], ['FEN', game.tree.startFen])
  const moves = treeToPgn(treeWithComments(game.tree, commentsOf(game)))
  const pgn = `${tags.map(([k, v]) => `[${k} "${escapeTag(v)}"]`).join('\n')}\n\n${moves} ${result}\n`
  return { chapter: ctx.chapter, gameIndex: ctx.gameIndex, white: heading.white, black: heading.black, event, result, pgn }
}

/** Every game with moves of a chapter text, as commented PGN, in reading order. */
export function gamesOfText(text: string, ctx: Omit<GameContext, 'gameIndex'>, algorithm?: 1 | 2): GeneratedGame[] {
  const games = recognizeGames(text, { algorithm })
  const out: GeneratedGame[] = []
  games.forEach((game, i) => {
    if (game.tree.mainline.length === 0) return
    out.push(buildGamePgn(game, text, { ...ctx, gameIndex: i }, games[i - 1]?.charEnd ?? 0))
  })
  return out
}

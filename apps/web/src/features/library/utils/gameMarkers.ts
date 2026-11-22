import { DIAGRAM_MARK, parseGameHeader } from '@chess-ebook/chess-shared'
import type { GameHeader, RecognizedGame } from '@chess-ebook/chess-shared'
import { bracesToParagraphs, paragraphsToBraces } from './commentLayout'
import { extractProseText, type ProseText } from './proseText'

/**
 * Where each recognised game lives in a chapter, and how it is framed in the
 * rendered prose: a hidden region around its moves, a visible start marker one
 * line before its heading (with the comment-layout switch), its heading lines
 * highlighted, and an end marker after its last move. Markers carry
 * `data-no-recognition` and no text, so they never change the recognition text.
 */

/** How a game's comments are written: in braces among the moves, or as paragraphs. */
export type CommentLayout = 'braces' | 'paragraphs'

export interface GameSummary {
  index: number
  /** The game number the book prints, or its position in the chapter. */
  number: number
  header: GameHeader | null
  /** Offset in the prose text where the game's heading starts (its first move line when it has none). */
  headingStart: number
  /** Offset where the line of the game's first move starts. */
  moveLineStart: number
  /** Short marker label: "Game 149 · Euwe – Réti". */
  label: string
  /** Table of contents entry: "149 · M. Euwe – R. Réti · Defensa Caro-Kann (B10)". */
  title: string
  /** Its comments are currently written in braces. */
  braces: boolean
}

const FEN = /[pnbrqkPNBRQK1-8]{1,8}(?:\/[pnbrqkPNBRQK1-8]{1,8}){7}/

/**
 * Where a game really starts in the text: its FEN when it is set up from one,
 * else its first move ("1."). The recogniser's own span may begin earlier
 * (on a number of the heading).
 */
export function gameStart(text: string, g: RecognizedGame): number {
  let first = Infinity
  for (const node of g.tree.nodes.values()) {
    if (node.charStart !== undefined && node.charStart >= g.charStart && node.charStart < first) first = node.charStart
  }
  if (!Number.isFinite(first)) return g.charStart
  const fen = FEN.exec(text.slice(g.charStart, first))
  if (fen) return g.charStart + fen.index
  // Include the move number written before it ("1." / "1...").
  const before = text.slice(Math.max(g.charStart, first - 10), first)
  const number = /\d+\.(?:\.\.)? ?$/.exec(before)
  return number ? first - (before.length - number.index) : first
}

/**
 * How the game's comments are written in the text: in braces when a "{" is
 * written between its first move and its end. The recogniser's own source
 * can't tell: it turns an engine line added to the book ("Stockfish 14 eval:
 * [-0.82] …") into an unclosed "{", which made a book written in paragraphs
 * look as if it were in braces (S10).
 */
export function writtenLayout(text: string, g: RecognizedGame): CommentLayout {
  return text.slice(gameStart(text, g), g.charEnd).includes('{') ? 'braces' : 'paragraphs'
}

/** Prose offsets of the game's own moves (its mainline). */
function mainlineStarts(g: RecognizedGame): number[] {
  return g.tree.mainline
    .map((id) => g.tree.nodes.get(id)?.charStart)
    .filter((n): n is number => n !== undefined)
}

const surname = (name: string) => name.trim().split(/\s+/).pop() ?? name

/** Read the heading before every game (via the shared parseGameHeader) and summarise it. */
export function describeGames(text: string, games: RecognizedGame[]): GameSummary[] {
  return games.map((g, index) => {
    const moveLineStart = text.lastIndexOf('\n', gameStart(text, g) - 1) + 1
    const floor = index > 0 ? Math.min(games[index - 1].charEnd, moveLineStart) : 0
    let header: GameHeader | null = null
    let headingStart = moveLineStart
    const before = text.slice(floor, moveLineStart)
    if (before.endsWith('\n')) {
      const lines = before.slice(0, -1).split('\n')
      header = parseGameHeader(lines.slice(-8))
      if (header && header.lines > 0) {
        headingStart = moveLineStart - lines.slice(-header.lines).join('\n').length - 1
      }
    }
    const number = header?.number ?? index + 1
    const players = header?.white && header.black ? `${header.white} – ${header.black}` : ''
    const opening = header?.opening ? `${header.opening}${header.eco ? ` (${header.eco})` : ''}` : ''
    return {
      index,
      number,
      header,
      headingStart,
      moveLineStart,
      label: `Game ${number}${header?.white && header.black ? ` · ${surname(header.white)} – ${surname(header.black)}` : ''}`,
      title: [String(number), players, opening].filter(Boolean).join(' · '),
      braces: writtenLayout(text, g) === 'braces',
    }
  })
}

const BLOCKS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'DD', 'DT',
  'FIGURE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ADDRESS',
])
const CONTAINERS = new Set(['TABLE', 'UL', 'OL', 'DL'])

/** The block a text node belongs to; inside a table or list, the whole table or list. */
function blockOf(node: Node, root: Element): Element | null {
  let found: Element | null = null
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    const tag = el.tagName.toUpperCase()
    if (CONTAINERS.has(tag)) found = el
    else if (!found && BLOCKS.has(tag)) found = el
  }
  return found
}

function textNodeAt(prose: ProseText, from: number, to: number, last = false): Node | null {
  if (last) {
    for (let i = Math.min(to, prose.map.length - 1); i >= from; i--) if (prose.map[i]) return prose.map[i]!.node
  } else {
    for (let i = Math.max(0, from); i <= to && i < prose.map.length; i++) if (prose.map[i]) return prose.map[i]!.node
  }
  return null
}

/** The run of sibling elements from the one holding `a` to the one holding `b`. */
function siblingRange(a: Element, b: Element, root: Element): Element[] | null {
  let common: Element | null = a
  while (common && !common.contains(b)) common = common.parentElement
  if (!common || !root.contains(common)) return null
  const childOf = (el: Element) => {
    let c = el
    while (c.parentElement && c.parentElement !== common) c = c.parentElement
    return c
  }
  if (common === a || common === b) return [common]
  const A = childOf(a)
  const B = childOf(b)
  const out: Element[] = []
  for (let el: Element | null = A; el; el = el.nextElementSibling) {
    out.push(el)
    if (el === B) return out
  }
  return null
}

/** The blocks that hold the prose text between two offsets (inclusive). */
function blocksBetween(prose: ProseText, root: Element, from: number, to: number): Element[] | null {
  const first = textNodeAt(prose, from, to)
  const last = textNodeAt(prose, from, to, true)
  if (!first || !last) return null
  const a = blockOf(first, root)
  const b = blockOf(last, root)
  return a && b ? siblingRange(a, b, root) : null
}

const gameEnd = (g: RecognizedGame) => Math.max(g.charStart, g.charEnd - 1)

/**
 * Rewrite the games whose chosen layout differs from how the book writes them
 * (braces ⇄ paragraphs), from the line of their first move to their last move.
 * Everything else in the chapter is left as it is. Returns the HTML unchanged
 * when nothing needs rewriting.
 */
export function applyGameLayouts(
  html: string,
  games: RecognizedGame[],
  layouts: Record<number, CommentLayout>,
): string {
  const chosen = Object.entries(layouts)
    .map(([i, layout]) => ({ game: games[Number(i)], layout }))
    .filter(({ game }) => game)
  if (chosen.length === 0 || !html) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body
  const prose = extractProseText(body)
  const wanted = chosen.filter(({ game, layout }) => writtenLayout(prose.text, game) !== layout)
  if (wanted.length === 0) return html
  const edits: { blocks: Element[]; lines: string[] }[] = []
  for (const { game, layout } of wanted) {
    const lineStart = prose.text.lastIndexOf('\n', gameStart(prose.text, game) - 1) + 1
    const blocks = blocksBetween(prose, body, lineStart, gameEnd(game))
    if (!blocks || blocks.some((b) => CONTAINERS.has(b.tagName.toUpperCase()))) continue
    let s = -1
    let e = -1
    prose.map.forEach((pos, i) => {
      if (!pos || !blocks.some((b) => b.contains(pos.node))) return
      if (s < 0) s = i
      e = i
    })
    if (s < 0) continue
    const part = prose.text.slice(s, e + 1)
    // A line holding one of the game's own moves is a line of moves; any other
    // line is a comment — books often print moves without a dot ("8 axb5") and
    // comments that open with a move ("13 h4!? (Petrosian-Ignatiev)").
    const starts = mainlineStarts(game)
    const lineStarts: number[] = []
    let at = s
    for (const line of part.split('\n')) { lineStarts.push(at); at += line.length + 1 }
    const isMoveLine = (index: number) => {
      const from = lineStarts[index]
      const to = index + 1 < lineStarts.length ? lineStarts[index + 1] : e + 1
      return starts.some((n) => n >= from && n < to)
    }
    const changed = layout === 'paragraphs' ? bracesToParagraphs(part) : paragraphsToBraces(part, isMoveLine)
    if (changed === part) continue
    edits.push({ blocks, lines: changed.split('\n').filter((l) => l.trim() !== '') })
  }
  if (edits.length === 0) return html

  for (const { blocks, lines } of edits) {
    const images = blocks.filter((b) => !/\S/.test(b.textContent ?? '') && (b.tagName === 'IMG' || b.querySelector('img, svg')))
    // The rewritten lines look like the game's own paragraphs, not like the hidden FEN line (epub-fen-hidden) a diagram may hold.
    const className = blocks.find((b) => b.tagName === 'P' && !b.classList.contains('epub-fen-hidden'))?.getAttribute('class') ?? null
    const hiddenFen = blocks.find((b) => b.classList.contains('epub-fen-hidden'))?.textContent?.trim() ?? null
    const first = blocks[0]
    const moved = new Set<Element>()
    for (const line of lines) {
      if (line.trim() === DIAGRAM_MARK) {
        const image = images.shift()
        if (image && image !== first) { first.parentNode?.insertBefore(image, first); moved.add(image) }
        else if (image) moved.add(image)
        continue
      }
      const p = doc.createElement('p')
      if (hiddenFen && line.trim() === hiddenFen) { p.setAttribute('class', 'epub-fen-hidden'); p.setAttribute('aria-hidden', 'true') }
      else if (className) p.setAttribute('class', className)
      p.textContent = line.trim()
      first.parentNode?.insertBefore(p, first)
    }
    blocks.forEach((b) => { if (!moved.has(b)) b.remove() })
  }
  const styles = [...doc.head.querySelectorAll('style, link[rel="stylesheet"]')].map((s) => s.outerHTML).join('')
  return styles + body.innerHTML
}

/** Remove every frame left by decorateGames (idempotent re-decoration). */
export function clearGameDecorations(root: Element): void {
  root.querySelectorAll('[data-game-marker]').forEach((m) => m.remove())
  root.querySelectorAll('[data-game-region]').forEach((r) => r.replaceWith(...r.childNodes))
  root.querySelectorAll('.game-heading-line').forEach((el) => {
    el.classList.remove('game-heading-line', 'game-heading-first', 'game-heading-last')
  })
}

export interface DecorateOptions {
  /** Chapter number, for the game anchors ("game-<chapter>-<index>"). */
  chapter: number
}

/** The anchor id of a game in a chapter. */
export const gameAnchorId = (chapter: number, index: number) => `game-${chapter}-${index}`

export function layoutToggleLabel(summary: Pick<GameSummary, 'number' | 'braces'>, scoped = true): string {
  const action = summary.braces ? 'show the comments as paragraphs' : 'show the comments in braces'
  return scoped ? `Game ${summary.number}: ${action}` : action[0].toUpperCase() + action.slice(1)
}

function marker(doc: Document, kind: 'start' | 'end', label: string): HTMLElement {
  const el = doc.createElement('div')
  el.setAttribute('data-game-marker', kind)
  el.setAttribute('data-no-recognition', '')
  el.setAttribute('data-label', label)
  el.className = `game-marker game-marker-${kind}`
  return el
}

/**
 * Frame every game of the rendered chapter. `prose` must be the extraction of
 * `root` that the games were recognised on.
 */
export function decorateGames(
  root: Element,
  prose: ProseText,
  games: RecognizedGame[],
  summaries: GameSummary[],
  { chapter }: DecorateOptions,
): void {
  const doc = root.ownerDocument
  games.forEach((g, index) => {
    const summary = summaries[index]
    if (!summary) return
    const end = gameEnd(g)

    // Hidden frame around the moves (from the first move's line to the last move).
    const moveBlocks = blocksBetween(prose, root, summary.moveLineStart, end)
    let region: Element | null = null
    if (moveBlocks && !moveBlocks.some((b) => b.closest('[data-game-region]') || b.querySelector('[data-game-region]'))) {
      region = doc.createElement('div')
      region.setAttribute('data-game-region', String(index))
      moveBlocks[0].before(region)
      region.append(...moveBlocks)
    }

    // The heading lines, highlighted as a section.
    let startBlock: Element | null = moveBlocks?.[0] ?? null
    if (summary.headingStart < summary.moveLineStart) {
      const heading = blocksBetween(prose, root, summary.headingStart, summary.moveLineStart - 1)
      if (heading && !heading.some((b) => b.closest('[data-game-region]'))) {
        heading.forEach((b) => b.classList.add('game-heading-line'))
        heading[0].classList.add('game-heading-first')
        heading[heading.length - 1].classList.add('game-heading-last')
        startBlock = heading[0]
      }
    }
    if (startBlock && region && moveBlocks?.[0] === startBlock) startBlock = region

    if (startBlock) {
      const start = marker(doc, 'start', summary.label)
      start.id = gameAnchorId(chapter, index)
      const button = doc.createElement('button')
      button.type = 'button'
      button.setAttribute('data-layout-toggle', String(index))
      button.setAttribute('data-glyph', summary.braces ? '¶' : '{ }')
      button.setAttribute('aria-label', layoutToggleLabel(summary))
      button.title = layoutToggleLabel(summary)
      button.className = 'game-layout-toggle'
      start.append(button)
      startBlock.before(start)
    }

    const last = textNodeAt(prose, summary.moveLineStart, end, true)
    const lastBlock = last ? blockOf(last, root) : null
    if (lastBlock) {
      const after = region && region.contains(lastBlock) ? region : lastBlock
      after.after(marker(doc, 'end', 'end'))
    }
  })
}

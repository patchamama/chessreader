import { DIAGRAM_MARK } from '@chess-ebook/chess-shared'
import type { GameNode, GameTree, IsolatedMove, RecognizedGame } from '@chess-ebook/chess-shared'

/**
 * Prose text extraction with an exact character → DOM position map.
 *
 * Recognition runs on the text this produces, and every recognised node keeps
 * the `charStart`/`charEnd` of its source token. Because the SAME extraction is
 * applied to the rendered reading pane, a node's offsets point at the exact DOM
 * text it came from. Wrapping moves is then a positional lookup — never a
 * regex/SAN search — so a prose "9. e5" can only be painted by the node that was
 * built from THAT token, and a "11... Nb6" can never borrow the "9... Nb6" node.
 */

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION',
  'FIGURE', 'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN',
  'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL', 'BR',
])
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'])

export interface TextPos {
  node: Text
  offset: number
}

export interface ProseText {
  text: string
  /** For each character of `text`: its DOM source, or null for synthetic whitespace. */
  map: (TextPos | null)[]
}

const isImage = (el: Element) => el.tagName.toUpperCase() === 'IMG' || el.hasAttribute('data-diagram-overlay')

/** Does this subtree hold any text of its own (outside images/diagram overlays)? */
function hasOwnText(n: Node): boolean {
  if (n.nodeType === 3) return /\S/.test(n.nodeValue ?? '')
  if (n.nodeType !== 1) return false
  const el = n as Element
  if (isImage(el) || SKIP_TAGS.has(el.tagName.toUpperCase())) return false
  for (let c = el.firstChild; c; c = c.nextSibling) if (hasOwnText(c)) return true
  return false
}

/** The nearest block-level ancestor of `el` (or `root`). */
function blockOf(el: Element, root: Node): Node {
  for (let p = el.parentNode; p && p !== root; p = p.parentNode) {
    if (p.nodeType === 1 && BLOCK_TAGS.has((p as Element).tagName.toUpperCase())) return p
  }
  return root
}

/**
 * Flatten a DOM subtree to recognition text: block boundaries become a newline
 * (the recogniser's paragraph signal), whitespace runs collapse like the browser
 * renders them, inline tags join without a gap (so `<span>♘</span>f3` reads
 * "♘f3"). An image that stands alone in its block is a board DIAGRAM: it becomes
 * a diagram mark on its own line, so the recogniser can tell that a fragment
 * may start there from the diagram's position. An image inside a line of text
 * (a figurine) is a space. Diagram overlays are treated as the image they
 * replaced.
 */
export function extractProseText(root: Node): ProseText {
  const out: string[] = []
  const map: (TextPos | null)[] = []
  let pending: 'none' | 'space' | 'newline' = 'none'

  const flush = () => {
    if (out.length === 0) { pending = 'none'; return }
    if (pending === 'newline') { out.push('\n'); map.push(null) }
    else if (pending === 'space') { out.push(' '); map.push(null) }
    pending = 'none'
  }
  const want = (p: 'space' | 'newline') => {
    if (p === 'newline' || pending === 'none') pending = p
  }

  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      const t = n as Text
      const v = t.nodeValue ?? ''
      for (let i = 0; i < v.length; i++) {
        const ch = v[i]
        if (/\s/.test(ch)) { want('space'); continue }
        flush()
        out.push(ch)
        map.push({ node: t, offset: i })
      }
      return
    }
    if (n.nodeType !== 1) return
    const el = n as Element
    const tag = el.tagName.toUpperCase()
    if (SKIP_TAGS.has(tag)) return
    if (isImage(el)) {
      if (!hasOwnText(blockOf(el, root))) {
        want('newline')
        flush()
        out.push(DIAGRAM_MARK)
        map.push(null)
        want('newline')
      } else {
        want('space')
      }
      return
    }
    const block = BLOCK_TAGS.has(tag)
    if (block) want('newline')
    for (let c = el.firstChild; c; c = c.nextSibling) walk(c)
    if (block) want('newline')
  }

  for (let c = root.firstChild; c; c = c.nextSibling) walk(c)
  return { text: out.join(''), map }
}

/** Parse an HTML string and extract its prose text (same rules as the live DOM). */
export function htmlToProseText(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return extractProseText(doc.body).text
}

/** One thing to paint in the prose: a game move or an isolated prose move. */
export type MoveTarget =
  | { kind: 'node'; gameIndex: number; tree: GameTree; node: GameNode; start: number; end: number }
  | { kind: 'iso'; gameIndex: number; iso: IsolatedMove; start: number; end: number }

/**
 * Every recognised token with a source position, in text order. The move
 * number written right before a move ("9." / "9...") is included in its range
 * so it is painted with the move, as before.
 */
export function planMoveTargets(text: string, games: RecognizedGame[]): MoveTarget[] {
  const targets: MoveTarget[] = []
  const withNumber = (start: number) => {
    const before = text.slice(Math.max(0, start - 10), start)
    const m = /(\d+\.(?:\.\.)?) ?$/.exec(before)
    return m ? start - (before.length - m.index) : start
  }
  games.forEach((game, gameIndex) => {
    for (const node of game.tree.nodes.values()) {
      if (!node.fen || node.invalid) continue
      if (node.charStart === undefined || node.charEnd === undefined) continue
      targets.push({ kind: 'node', gameIndex, tree: game.tree, node, start: withNumber(node.charStart), end: node.charEnd })
    }
    for (const iso of game.tree.isolatedMoves) {
      if (iso.charStart === undefined || iso.charEnd === undefined) continue
      targets.push({ kind: 'iso', gameIndex, iso, start: iso.charStart, end: iso.charEnd })
    }
  })
  targets.sort((a, b) => a.start - b.start)
  // Defensive: drop any range overlapping the previous one.
  const result: MoveTarget[] = []
  let lastEnd = -1
  for (const t of targets) {
    if (t.start < lastEnd) continue
    result.push(t)
    lastEnd = t.end
  }
  return result
}

/** A contiguous slice of one DOM text node belonging to a target. */
export interface TextPiece<T> {
  start: number
  end: number
  target: T
}

/**
 * Split each target's text range into per-text-node pieces (a token may cross
 * inline tags, e.g. `<b>♘</b>f3`). Returns the pieces grouped by text node.
 */
export function piecesByTextNode<T extends { start: number; end: number }>(
  map: (TextPos | null)[],
  targets: T[],
): Map<Text, TextPiece<T>[]> {
  const byNode = new Map<Text, TextPiece<T>[]>()
  for (const target of targets) {
    let cur: TextPiece<T> | null = null
    let curNode: Text | null = null
    for (let i = target.start; i < target.end && i < map.length; i++) {
      const pos = map[i]
      if (!pos) continue
      // Same text node: extend (collapsed whitespace in between is included).
      if (cur && curNode === pos.node) {
        cur.end = pos.offset + 1
        continue
      }
      cur = { start: pos.offset, end: pos.offset + 1, target }
      curNode = pos.node
      const list = byNode.get(pos.node) ?? []
      list.push(cur)
      byNode.set(pos.node, list)
    }
  }
  for (const list of byNode.values()) list.sort((a, b) => a.start - b.start)
  return byNode
}

/**
 * The last move written before `offset`: the position a remark at that point of
 * the text talks about (null = before the first move, i.e. the start position).
 */
export function nodeBeforeOffset(tree: GameTree, offset: number): GameNode | null {
  let best: GameNode | null = null
  for (const node of tree.nodes.values()) {
    if (node.invalid || node.charEnd === undefined || node.charEnd > offset) continue
    if (!best || node.charEnd > best.charEnd!) best = node
  }
  return best
}

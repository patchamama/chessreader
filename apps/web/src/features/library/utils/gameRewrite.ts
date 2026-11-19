import type { RecognizedGame } from '@chess-ebook/chess-shared'
import { extractProseText, type ProseText } from './proseText'
import { humanCommentInner, readCommentMainLine, textToHtml } from './textToChapters'
import type { CommentAlternative } from './diagramMark'

/**
 * A game of a chapter commented again in place (S3): from the line of its first
 * move to the line of its last move (or of the last move of its variations),
 * everything — comments, variations, images — is replaced by the new
 * commentary. The rest of the chapter is left as it is.
 */

/** Prose offsets of a game's text: from the start of its first move's line to the end of its last move's line. */
export function gameLineRange(text: string, game: RecognizedGame): { start: number; end: number } {
  const main = game.tree.mainline.map((id) => game.tree.nodes.get(id)).filter((n) => n !== undefined)
  const first = main.find((n) => n.charStart !== undefined)?.charStart ?? game.charStart
  let last = [...main].reverse().find((n) => n.charEnd !== undefined)?.charEnd ?? game.charEnd
  // Variations written after the last move belong to the game too.
  for (const node of game.tree.nodes.values()) {
    if (node.charEnd !== undefined && node.charEnd > last && node.charEnd <= game.charEnd) last = node.charEnd
  }
  const start = text.lastIndexOf('\n', first - 1) + 1
  const nl = text.indexOf('\n', Math.max(start, last - 1))
  return { start, end: nl < 0 ? text.length : nl }
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

function textNodeAt(prose: ProseText, from: number, to: number, last: boolean): Node | null {
  if (last) {
    for (let i = Math.min(to, prose.map.length - 1); i >= from; i--) if (prose.map[i]) return prose.map[i]!.node
  } else {
    for (let i = Math.max(0, from); i <= to && i < prose.map.length; i++) if (prose.map[i]) return prose.map[i]!.node
  }
  return null
}

/** The run of sibling elements from the block holding the first offset to the one holding the last. */
function blocksBetween(prose: ProseText, root: Element, from: number, to: number): Element[] | null {
  const firstNode = textNodeAt(prose, from, to, false)
  const lastNode = textNodeAt(prose, from, to, true)
  const a = firstNode ? blockOf(firstNode, root) : null
  const b = lastNode ? blockOf(lastNode, root) : null
  if (!a || !b) return null
  let common: Element | null = a
  while (common && !common.contains(b)) common = common.parentElement
  if (!common || !root.contains(common)) return null
  if (common === a || common === b) return [common]
  const childOf = (el: Element) => {
    let c = el
    while (c.parentElement && c.parentElement !== common) c = c.parentElement
    return c
  }
  const out: Element[] = []
  const B = childOf(b)
  for (let el: Element | null = childOf(a); el; el = el.nextElementSibling) {
    out.push(el)
    if (el === B) return out
  }
  return null
}

/** Keep the stylesheets DOMParser moved into <head>, as applyGameLayouts does. */
function serialise(doc: Document): string {
  const styles = [...doc.head.querySelectorAll('style, link[rel="stylesheet"]')].map((s) => s.outerHTML).join('')
  return styles + doc.body.innerHTML
}

/**
 * Put the new commentary of each rewritten game (by game index) in place of
 * its text. `games` must be recognised on the prose text of `html`. Returns the
 * HTML unchanged when nothing is rewritten.
 */
export function applyGameRewrites(
  html: string,
  games: RecognizedGame[],
  rewrites: Record<number, string | { text: string }>,
): string {
  const chosen = Object.entries(rewrites)
    .map(([i, r]) => ({ game: games[Number(i)], text: typeof r === 'string' ? r : r?.text }))
    .filter((c): c is { game: RecognizedGame; text: string } => !!c.game && typeof c.text === 'string' && c.text.trim() !== '')
  if (chosen.length === 0 || !html) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body
  const prose = extractProseText(body)
  // Every range is found on the same text before anything is changed.
  const edits: { blocks: Element[]; text: string }[] = []
  for (const { game, text } of chosen) {
    const { start, end } = gameLineRange(prose.text, game)
    const blocks = blocksBetween(prose, body, start, Math.max(start, end - 1))
    if (!blocks || blocks.some((b) => CONTAINERS.has(b.tagName.toUpperCase()))) continue
    edits.push({ blocks, text })
  }
  if (edits.length === 0) return html

  for (const { blocks, text } of edits) {
    const className = blocks.find((b) => b.tagName === 'P')?.getAttribute('class') ?? null
    const template = doc.createElement('template')
    template.innerHTML = textToHtml(text)
    // The book's own paragraph style on the new plain paragraphs.
    if (className) {
      for (const el of template.content.children) if (el.tagName === 'P' && !el.hasAttribute('class')) el.setAttribute('class', className)
    }
    blocks[0].before(template.content)
    blocks.forEach((b) => b.remove())
  }
  return serialise(doc)
}

/**
 * The book comments shown again (S4): every quote that keeps several remarks of
 * its position shows one of them, picked at random. `pick` 0 keeps the remark
 * the commentary was written with.
 */
export function pickBookComments(html: string, pick: number, random: () => number = Math.random): string {
  if (pick === 0 || !html.includes('data-comment-alternatives')) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let changed = false
  doc.body.querySelectorAll('blockquote.human-comment[data-comment-alternatives]').forEach((quote) => {
    let alternatives: CommentAlternative[]
    try {
      alternatives = JSON.parse(quote.getAttribute('data-comment-alternatives') ?? '[]') as CommentAlternative[]
    } catch {
      return
    }
    if (!Array.isArray(alternatives) || alternatives.length < 2) return
    const choice = alternatives[Math.min(alternatives.length - 1, Math.floor(random() * alternatives.length))]
    if (!choice || typeof choice.text !== 'string') return
    const fen = quote.getAttribute('data-comment-fen') ?? undefined
    // Numbered moves of the remark ("5…Nc6") are read against the game's main line (S7).
    const mainLine = readCommentMainLine(quote.getAttribute('data-comment-mainline'))
    quote.innerHTML = humanCommentInner({ ...choice, source: choice.source ?? '', ...(fen ? { fen } : {}) }, mainLine)
    changed = true
  })
  return changed ? serialise(doc) : html
}

/**
 * Put each framed game (see decorateGames), from its start marker to its end
 * marker, in its own container `[data-game-container="<index>"]` (study-tools-round
 * S6): the element the reader keeps in place and flashes when the game is
 * rewritten (layout switch, comment again, restore). Later games are wrapped
 * first, so a game whose text runs over the next ones holds their containers.
 * A game whose markers do not share a parent is left unwrapped.
 */
export function wrapGameContainers(root: Element): void {
  const starts = [...root.querySelectorAll('[data-game-marker="start"]')].reverse()
  starts.forEach((start) => {
    const index = start.querySelector('[data-layout-toggle]')?.getAttribute('data-layout-toggle')
    if (index == null) return
    let end: Element | null = null
    for (let el = start.nextElementSibling; el; el = el.nextElementSibling) {
      const kind = el.getAttribute('data-game-marker')
      if (kind === 'start') break
      if (kind === 'end') { end = el; break }
    }
    if (!end) return
    const box = root.ownerDocument.createElement('div')
    box.setAttribute('data-game-container', index)
    start.before(box)
    const nodes: Node[] = []
    for (let n: Node | null = start; n; n = n.nextSibling) {
      nodes.push(n)
      if (n === end) break
    }
    box.append(...nodes)
  })
}

/** Remove the containers left by wrapGameContainers (idempotent re-decoration). */
export function unwrapGameContainers(root: Element): void {
  root.querySelectorAll('[data-game-container]').forEach((box) => box.replaceWith(...box.childNodes))
}

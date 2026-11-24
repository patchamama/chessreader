import { parseActions, serializeAction, type NarrationAction } from '@chess-ebook/chess-shared'
import { normGuideText } from './guideStore'

/**
 * The guide of a comment or paragraph shown in the book text (ai-narration-guides S1, S2): a
 * line of monospace chips under it, one per action, built straight in the DOM so the reader's
 * own effects (which own the paragraphs) are not disturbed. The line is out of the recognition.
 */
export interface GuideChipTarget {
  /** The element the chip line goes after. */
  anchor: Element
  /** The element holding the text the actions' word indices count in. */
  textElement: Element
  actions: string
  fen: string
}

export interface GuideChipGroup {
  container: HTMLElement
  textElement: Element
  fen: string
  actions: NarrationAction[]
  /** The text, normalised. */
  text: string
}

const groups = new WeakMap<Element, GuideChipGroup>()

/** Styles of the chip lines, the narrated chip and the word it is anchored to. */
export const GUIDE_CHIPS_CSS = `
.guide-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: -0.4rem 0 0.9rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.2; }
.guide-chip { cursor: pointer; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; color: #475569; padding: 1px 5px; font: inherit; }
.guide-chip:hover { background: #e0f2fe; border-color: #38bdf8; }
.guide-chip-active { background: #fde68a; border-color: #d97706; color: #78350f; }
.guide-chip-pinned { outline: 2px solid #0ea5e9; }
::highlight(guide-word) { background-color: #fde68a; color: #1a1a1a; }
`

export function clearGuideChips(root: Element): void {
  root.querySelectorAll('[data-guide-chips]').forEach((el) => el.remove())
}

/** Replace the chip lines of `root` by those of `targets` (a target without a readable action gets none). */
export function renderGuideChips(root: Element, targets: GuideChipTarget[]): void {
  clearGuideChips(root)
  const doc = root.ownerDocument
  for (const t of targets) {
    const actions = parseActions(t.actions).actions
    if (actions.length === 0) continue
    const container = doc.createElement('div')
    container.className = 'guide-chips'
    container.setAttribute('data-guide-chips', '')
    container.setAttribute('data-no-recognition', '')
    container.setAttribute('contenteditable', 'false')
    actions.forEach((a, i) => {
      const chip = doc.createElement('button')
      chip.type = 'button'
      chip.className = 'guide-chip'
      chip.setAttribute('data-guide-index', String(i))
      chip.setAttribute('title', `Word ${a.at}: preview on the board`)
      chip.textContent = serializeAction(a)
      container.append(chip)
    })
    t.anchor.after(container)
    groups.set(container, { container, textElement: t.textElement, fen: t.fen, actions, text: normGuideText(t.textElement.textContent ?? '') })
  }
}

/** The action a chip stands for, with its paragraph; null when the element is not a chip. */
export function chipAction(el: Element | null): { group: GuideChipGroup; action: NarrationAction; index: number } | null {
  const chip = el?.closest?.('.guide-chip') ?? null
  const container = chip?.closest('[data-guide-chips]')
  const group = container ? groups.get(container) : undefined
  const index = Number(chip?.getAttribute('data-guide-index'))
  if (!chip || !group || !Number.isInteger(index) || !group.actions[index]) return null
  return { group, action: group.actions[index], index }
}

/** The text pieces of an element (not the chip lines), with their start offset in the joined text. */
function textPieces(el: Element): { node: Text; start: number }[] {
  const out: { node: Text; start: number }[] = []
  let at = 0
  const walk = (n: Node) => {
    if (n.nodeType === 3) { out.push({ node: n as Text, start: at }); at += (n as Text).length; return }
    if (n.nodeType !== 1 || (n as Element).hasAttribute('data-guide-chips')) return
    n.childNodes.forEach(walk)
  }
  walk(el)
  return out
}

/** The range of word `index` (narration words: split on white space) of an element's text; null past the last word. */
export function wordRange(el: Element, index: number): Range | null {
  const pieces = textPieces(el)
  const text = pieces.map((p) => p.node.data).join('')
  let i = 0
  for (const m of text.matchAll(/\S+/g)) {
    if (i++ !== index) continue
    const start = m.index!
    const end = start + m[0].length
    const first = [...pieces].reverse().find((p) => p.start <= start)
    const last = [...pieces].reverse().find((p) => p.start < end)
    if (!first || !last) return null
    const range = el.ownerDocument.createRange()
    range.setStart(first.node, start - first.start)
    range.setEnd(last.node, end - last.start)
    return range
  }
  return null
}

interface HighlightRegistry { set: (name: string, h: unknown) => void; delete: (name: string) => void }

/** Light a range of the text (the CSS highlight API: no change to the DOM); null puts the light out. Browsers without it show nothing. */
export function setWordHighlight(range: Range | null): void {
  const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights
  const Highlight = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight
  if (!registry || !Highlight) return
  if (range) registry.set('guide-word', new Highlight(range))
  else registry.delete('guide-word')
}

/** Indices of the actions being performed when the narrator is at word `at`: those of the last word with an action at or before it. */
export function activeChipsAt(actions: NarrationAction[], at: number): number[] {
  const last = actions.reduce((best, a) => (a.at <= at && a.at > best ? a.at : best), -1)
  if (last < 0) return []
  return actions.flatMap((a, i) => (a.at === last ? [i] : []))
}

/** Whether a text is the one a group was made for (the same rule the narrator uses to find its actions). */
export function sameGuideText(a: string, b: string): boolean {
  const x = normGuideText(a).toLowerCase()
  const y = normGuideText(b).toLowerCase()
  return x === y || (x.length >= 20 && y.length >= 20 && (x.includes(y) || y.includes(x)))
}

/** Mark the chips performed while `text` is narrated at word `at` (null: nothing narrated), and return the word to light. */
export function markActiveChips(root: Element, text: string | null, at: number): { group: GuideChipGroup; word: number } | null {
  root.querySelectorAll('.guide-chip-active').forEach((c) => c.classList.remove('guide-chip-active'))
  if (text === null) return null
  let found: { group: GuideChipGroup; word: number } | null = null
  root.querySelectorAll('[data-guide-chips]').forEach((container) => {
    const group = groups.get(container)
    if (!group || found || !sameGuideText(group.text, text)) return
    const active = activeChipsAt(group.actions, at)
    const chips = container.querySelectorAll('.guide-chip')
    active.forEach((i) => chips[i]?.classList.add('guide-chip-active'))
    if (active.length) found = { group, word: group.actions[active[0]].at }
  })
  return found
}

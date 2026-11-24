import { useEffect, useRef, type RefObject } from 'react'
import type { RecognizedGame } from '@chess-ebook/chess-shared'
import { databaseActionsFor } from './commentActions'
import { chipAction, clearGuideChips, markActiveChips, renderGuideChips, setWordHighlight, wordRange, type GuideChipTarget } from './guideChips'
import { guideKey, useGuideStore } from './guideStore'
import { guideParagraphs, guideQuotes } from './guideTargets'
import { endGuidePreview, previewGuideAction } from './guidePreview'
import { useNarrationStore } from './narrationStore'

interface Options {
  rootRef: RefObject<HTMLElement | null>
  /** The debug preference: chips are only in the text while it is on. */
  enabled: boolean
  bookId: number | string
  chapter: number
  games: RecognizedGame[]
  /** Whatever changes when the text of the pane is replaced (the chips are rebuilt then). */
  content: unknown
  /** Bumped when guides were saved elsewhere (the database) and must be read again. */
  refresh?: number
}

/**
 * The narration guides in the reading pane (ai-narration-guides S1, S2): chips under the
 * paragraphs (stored here) and the comments of the database that have actions, shown only when
 * `enabled`; hovering a chip previews its action on the board, clicking pins it; the chip being
 * performed by the narrator and the word it is anchored to are lit.
 */
export function useGuideChips({ rootRef, enabled, bookId, chapter, games, content, refresh = 0 }: Options): void {
  const guides = useGuideStore((s) => s.guides)
  const gamesRef = useRef(games)
  gamesRef.current = games

  // The chips themselves.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (!enabled) { clearGuideChips(root); return }
    let cancelled = false
    const targets: GuideChipTarget[] = []
    for (const p of guideParagraphs(root)) {
      const guide = guides[guideKey(bookId, chapter, p.text)]
      if (guide) targets.push({ anchor: p.element, textElement: p.element, actions: guide.actions, fen: guide.fen })
    }
    const pending: Promise<GuideChipTarget | null>[] = []
    for (const q of guideQuotes(root)) {
      const local = guides[guideKey(bookId, chapter, q.text)]
      if (local) { targets.push({ anchor: q.element, textElement: q.textElement, actions: local.actions, fen: q.fen }); continue }
      pending.push(databaseActionsFor(q.text, q.fen).then((actions) => (actions ? { anchor: q.element, textElement: q.textElement, actions, fen: q.fen } : null), () => null))
    }
    renderGuideChips(root, targets)
    if (pending.length) {
      void Promise.all(pending).then((found) => {
        const fromDatabase = found.filter((t): t is GuideChipTarget => !!t)
        if (!cancelled && fromDatabase.length) renderGuideChips(root, [...targets, ...fromDatabase])
      })
    }
    return () => { cancelled = true }
  }, [rootRef, enabled, content, guides, bookId, chapter, refresh])

  // Hover previews, click pins.
  useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled) return
    let pinned: Element | null = null
    const chipOf = (e: Event) => (e.target as Element | null)?.closest?.('.guide-chip') ?? null
    const over = (e: Event) => {
      const chip = chipOf(e)
      const hit = chip && chipAction(chip)
      if (hit && !pinned) previewGuideAction(hit, gamesRef.current)
    }
    const out = (e: Event) => {
      const chip = chipOf(e)
      if (chip && !pinned && !chip.contains((e as MouseEvent).relatedTarget as Node | null)) endGuidePreview()
    }
    const click = (e: Event) => {
      const chip = chipOf(e)
      const hit = chip && chipAction(chip)
      if (!chip || !hit) return
      e.preventDefault()
      root.querySelectorAll('.guide-chip-pinned').forEach((c) => c.classList.remove('guide-chip-pinned'))
      if (pinned === chip) { pinned = null; endGuidePreview(); return }
      pinned = chip
      chip.classList.add('guide-chip-pinned')
      previewGuideAction(hit, gamesRef.current)
    }
    root.addEventListener('mouseover', over)
    root.addEventListener('mouseout', out)
    root.addEventListener('click', click)
    return () => {
      root.removeEventListener('mouseover', over)
      root.removeEventListener('mouseout', out)
      root.removeEventListener('click', click)
      if (pinned) endGuidePreview()
    }
  }, [rootRef, enabled, content])

  // The chip and the word of the action the narrator is performing.
  useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled) return
    const apply = (narrated: { text: string; at: number } | null) => {
      const hit = markActiveChips(root, narrated?.text ?? null, narrated?.at ?? 0)
      if (hit) setWordHighlight(wordRange(hit.group.textElement, hit.word))
      else if (narrated === null && !root.querySelector('.guide-chip-pinned')) setWordHighlight(null)
    }
    apply(useNarrationStore.getState().narrated)
    const unsub = useNarrationStore.subscribe((s, prev) => { if (s.narrated !== prev.narrated) apply(s.narrated) })
    return () => { unsub(); markActiveChips(root, null, 0) }
  }, [rootRef, enabled, content, guides, refresh])
}

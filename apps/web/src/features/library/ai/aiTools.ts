import type { GenerateGuidesResult } from '../narration/guideGeneration'

/** One entry of the AI menu. `run` does the work (long tasks show their own progress in the status footer). */
export interface AiToolEntry {
  id: string
  label: string
  hint?: string
  run: () => Promise<unknown> | unknown
}

/**
 * SLOT: entries other AI tools add to this menu without touching the component.
 * "Comment key moments with AI" (ai-narration-guides S5) goes here (or comes in through `extraEntries`).
 */
export const EXTRA_AI_TOOLS: AiToolEntry[] = []

export function summarize(r: GenerateGuidesResult): string {
  if (r.total === 0) return 'No paragraph of this chapter follows a move.'
  const parts = [`${r.generated} ${r.generated === 1 ? 'guide' : 'guides'} made`]
  if (r.empty) parts.push(`${r.empty} without a valid action`)
  if (r.failed) parts.push(`${r.failed} failed${r.firstError ? ` (${r.firstError})` : ''}`)
  if (r.skipped) parts.push(`${r.skipped} already had one`)
  if (r.cancelled) parts.push('cancelled')
  return parts.join(', ')
}

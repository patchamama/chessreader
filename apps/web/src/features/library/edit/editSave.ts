import { buildSuggestion, type SuggestionTarget } from '../../suggestions/suggestionFormat'
import { saveSuggestion, type SaveSuggestionResult } from '../../suggestions/suggestionsApi'
import { usePendingSuggestions } from '../../suggestions/pendingSuggestions'

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Plain text as paragraphs: one per blank-line-separated part, line breaks kept. */
export function textToHtml(text: string): string {
  return text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n')
}

export const diagramHtml = (fen: string, src: string) =>
  `<p><img class="diagram" data-fen="${escapeHtml(fen)}" alt="Diagram" src="${escapeHtml(src)}"></p>`

export const imageHtml = (src: string, alt: string) => `<p><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"></p>`

export interface EditSaveInput {
  kind: 'insert' | 'text'
  target: SuggestionTarget
  before: unknown
  after: unknown
  author: 'ai' | 'user'
  model?: string
  /** What the page shows instead of `after` while it is pending. */
  display?: string
}

/** Saves the suggestion (server, resources repository, or nowhere) and shows it in place for the rest of the session. */
export async function saveEdit(input: EditSaveInput): Promise<SaveSuggestionResult> {
  const { display, ...rest } = input
  const s = buildSuggestion(rest)
  const result = await saveSuggestion(s)
  usePendingSuggestions.getState().add(s, display)
  return result
}

export function describeSave(r: SaveSuggestionResult): string {
  if (r.saved) return r.where === 'server' ? 'Saved on the server; shown here as pending until it is accepted.' : 'Saved to the resources repository; shown here as pending until it is accepted.'
  return `Not stored${r.reason ? ` (${r.reason})` : ''}: shown here for this session only. Download the JSON to add it to the resources repository.`
}

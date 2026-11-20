import { useMemo, useState } from 'react'
import { useLlm } from '../../../shared/llm'
import { validateRewrite } from '../../comments/commentPrompts'
import type { SuggestionAnchor } from '../../suggestions/suggestionFormat'
import type { SaveSuggestionResult } from '../../suggestions/suggestionsApi'
import { textDiff } from '../../suggestions/textDiff'
import { saveEdit } from './editSave'
import { EditDialog } from './EditDialog'

const SYSTEM = [
  'You correct a paragraph of a chess book: typos, OCR errors (broken words, wrong letters, stray characters) and punctuation.',
  'Keep every chess move exactly as written, keep the language, the meaning and the wording otherwise.',
  'Answer with the corrected paragraph only, without quotes or explanations.',
].join(' ')

const clean = (answer: string) => answer.trim().replace(/^```[a-z]*\n?|\n?```$/g, '').replace(/^["“](.*)["”]$/s, '$1').trim()

export interface ParagraphEditPanelProps {
  book: string
  chapter: number
  anchor: SuggestionAnchor
  /** The paragraph's text as loaded. */
  original: string
  onClose: () => void
  onSaved: (result: SaveSuggestionResult) => void
}

/** The ✎ of edit mode: a corrected text for a paragraph, typed or proposed by the AI model (S5, S8). */
export function ParagraphEditPanel({ book, chapter, anchor, original, onClose, onSaved }: ParagraphEditPanelProps) {
  const llm = useLlm()
  const [text, setText] = useState(original)
  const [proposal, setProposal] = useState<{ text: string; model: string } | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const diff = useMemo(() => textDiff(original, text), [original, text])
  const changed = text.trim() !== '' && text.trim() !== original.trim()

  const suggest = async () => {
    setAsking(true)
    setProblem(null)
    try {
      const r = await llm.complete({ system: SYSTEM, messages: [{ role: 'user', text: original }], maxTokens: 2000 })
      const answer = clean(r.text)
      const problems = validateRewrite(original, answer)
      if (problems.length) { setProblem(`The model's text was not used: ${problems.join('; ')}.`); return }
      setText(answer)
      setProposal({ text: answer, model: r.model })
    } catch (e) {
      setProblem(`The model did not answer: ${(e as Error).message}`)
    } finally {
      setAsking(false)
    }
  }

  const save = async () => {
    setBusy(true)
    try {
      const fromModel = proposal && proposal.text === text.trim() ? proposal : null
      const result = await saveEdit({
        kind: 'text', target: { book, chapter, anchor },
        before: { text: original }, after: { text: text.trim() },
        author: fromModel ? 'ai' : 'user', ...(fromModel ? { model: fromModel.model } : {}),
      })
      onSaved(result)
    } catch (e) {
      setProblem((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <EditDialog label="Edit paragraph" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium text-slate-700">Corrected text</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="w-full rounded border border-slate-300 p-2" />
        </label>
        {llm.available && (
          <button type="button" onClick={() => void suggest()} disabled={asking} className="rounded border border-violet-300 bg-violet-50 px-3 py-1.5 text-violet-800 disabled:opacity-50">
            {asking ? 'Asking the model…' : 'Suggest an improvement'}
          </button>
        )}
        {problem && <p role="alert" className="text-red-700">{problem}</p>}
        <div>
          <span className="mb-1 block font-medium text-slate-700">Changes</span>
          <p data-testid="text-diff" className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2">
            {diff.map((part, i) =>
              part.type === 'removed' ? <del key={i} className="bg-red-100 text-red-800">{part.text}</del>
                : part.type === 'added' ? <ins key={i} className="bg-green-100 text-green-800 no-underline">{part.text}</ins>
                  : <span key={i}>{part.text}</span>)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={!changed || busy} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
          Save suggestion
        </button>
      </div>
    </EditDialog>
  )
}

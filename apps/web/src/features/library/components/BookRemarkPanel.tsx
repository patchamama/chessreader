import { useState } from 'react'
import { usePositionComments } from '../../comments/usePositionComments'
import { toEntry } from '../../comments/toEntry'
import CommentDetailsModal from '../../database/CommentDetailsModal'
import LinkedText from '../../../shared/ui/LinkedText'
import { commentSource, type HumanComment } from '../commentdb/commentLookup'

/** A remark chosen for the book: its text, source and where it was found. */
export interface ChosenRemark { text: string; source: string; gameId?: string; ply?: number }

/** The universal (normalized) text of a comment in the reader's language, when the database has one. */
const normalizedOf = (c: HumanComment, lang: string) => c.translations?.[lang] || c.translations?.[c.lang] || ''

/**
 * Every remark the database holds on a position of the book, each saying whether
 * it is normalized: pick the normalized or the original text for the book, or
 * edit it (the editor can regenerate its normalized text or a translation with
 * the AI that is set up).
 */
export default function BookRemarkPanel({ fen, lang, onUse, onClose }: { fen: string; lang: string; onUse: (c: ChosenRemark) => void; onClose: () => void }) {
  const all = usePositionComments(fen)
  const [editing, setEditing] = useState<HumanComment | null>(null)
  const use = (c: HumanComment, text: string) => onUse({ text, source: commentSource(c), ...(c.gameId ? { gameId: c.gameId } : {}), ...(c.ply > 0 ? { ply: c.ply } : {}) })
  const button = 'rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50'
  return (
    <div role="dialog" aria-label="Comments of this position" className="fixed inset-x-2 bottom-2 z-40 max-h-[60vh] overflow-auto rounded-lg border border-slate-300 bg-white p-3 text-sm shadow-xl sm:inset-x-auto sm:right-4 sm:w-[28rem]">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Comments of this position ({all.length})</h2>
        <button type="button" className={button} aria-label="Close the comments panel" onClick={onClose}>✕</button>
      </div>
      {all.length === 0 && <p className="text-slate-500">The database has no comment for this position.</p>}
      <ul className="flex flex-col gap-2">
        {all.map((c, i) => {
          const normalized = normalizedOf(c, lang)
          const label = c.id ?? i
          return (
            <li key={label} className="rounded border border-slate-200 p-2">
              <p className="whitespace-pre-line"><LinkedText text={normalized || c.text} /></p>
              {normalized && normalized !== c.text && <details className="mt-1 text-xs text-slate-600"><summary>Original</summary><p className="whitespace-pre-line"><LinkedText text={c.text} /></p></details>}
              <p className="mt-1 text-xs text-slate-600">
                <span className={c.translations?.[c.lang] ? 'font-semibold text-emerald-700' : 'text-amber-700'}>{c.translations?.[c.lang] ? 'normalized' : 'not normalized'}</span>
                {' · '}{commentSource(c)}
              </p>
              <p className="mt-1 flex flex-wrap gap-1">
                {normalized && <button type="button" className={button} aria-label={`Use the normalized text of comment ${label}`} onClick={() => use(c, normalized)}>Use normalized</button>}
                <button type="button" className={button} aria-label={`Use the original text of comment ${label}`} onClick={() => use(c, c.text)}>Use original</button>
                <button type="button" className={button} aria-label={`Edit comment ${label}`} onClick={() => setEditing(c)}>Edit</button>
              </p>
            </li>
          )
        })}
      </ul>
      {editing && <CommentDetailsModal comment={toEntry(editing, fen)} onClose={() => setEditing(null)} />}
    </div>
  )
}

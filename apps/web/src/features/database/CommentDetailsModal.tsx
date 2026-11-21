import { useEffect, useRef, useState } from 'react'
import { useLlm } from '../../shared/llm'
import { boardSvgDataUrl } from '../library/utils/boardSvg'
import { langName, TARGET_LANGS } from '../comments/commentPrompts'
import { proposeComment, saveCommentProposal, type CommentAction } from '../comments/commentAi'
import DeleteControl from './DeleteControl'
import OpenGameButton from './OpenGameButton'
import LinkedText from '../../shared/ui/LinkedText'
import { hasServerSession } from '../../shared/api/serverSession'
import { hideComment, moveLabel, setCommentTranslation, type CommentEntry } from '../comments/commentsApi'

/** One editable text of the comment: the universal text (own language) or a translation. */
interface Field { key: string; lang: string; label: string; action: CommentAction }

const fieldsOf = (c: CommentEntry): Field[] => [
  { key: c.lang, lang: c.lang, label: 'Universal text', action: { kind: 'universal' } },
  ...TARGET_LANGS.filter((l) => l !== c.lang).map((l): Field => ({ key: l, lang: l, label: langName(l), action: { kind: 'translate', lang: l } })),
]

/**
 * Comment details (S3): every field of a comment with its diagram; the missing
 * texts are typed or generated with the AI, and Save stores each changed one as a suggestion.
 */
export default function CommentDetailsModal({ comment: c, onClose, onHidden, onSaved }: { comment: CommentEntry; onClose: () => void; onHidden?: () => void; /** The texts written into the database (by language), so the lists can show them. */ onSaved?: (saved: Record<string, string>) => void }) {
  const llm = useLlm()
  const fields = fieldsOf(c)
  const initial = (f: Field) => c.translations?.[f.key] ?? ''
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, initial(f)])))
  const [generated, setGenerated] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  const generate = async (f: Field) => {
    setBusy(f.key)
    setError(null)
    try {
      const p = await proposeComment(llm.complete, c, f.action)
      setValues((v) => ({ ...v, [f.key]: p.text }))
      setGenerated((g) => ({ ...g, [f.key]: p.model }))
      if (p.problems.length) setError(`${f.label}: ${p.problems.join('; ')}`)
    } catch (e) {
      setError(`${f.label}: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy('save')
    setError(null)
    try {
      const written: Record<string, string> = {}
      for (const f of fields) {
        const text = values[f.key].trim()
        if (!text || text === initial(f).trim()) continue
        const model = generated[f.key]
        // The suggestion is the record; with a server the text is also written into its database, where the lists and the reader read it.
        await saveCommentProposal(c, f.action, { text, lang: f.lang, model: model ?? 'manual', problems: [] }, model ? 'ai' : 'user')
        if (hasServerSession()) {
          await setCommentTranslation(c.id, f.lang, text)
          written[f.lang] = text
        }
      }
      if (Object.keys(written).length) onSaved?.(written)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  const move = moveLabel(c)
  const players = [c.game.white, c.game.black].filter(Boolean).join(' – ') || c.game.label || `Game ${c.gameId}`
  const row = (name: string, value: string) => (<><dt className="font-semibold text-slate-600">{name}</dt><dd className="break-all">{value}</dd></>)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Comment ${c.id} details`} className="max-h-full w-full max-w-3xl overflow-auto rounded bg-white p-4 text-sm shadow-lg"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <div className="flex gap-3">
          <img src={boardSvgDataUrl(c.fen)} alt={`Position after ${move}`} width={160} height={160} className="h-40 w-40 shrink-0 rounded" />
          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            {row('Id', String(c.id))}
            {row('Hash', c.hash)}
            {row('FEN', c.fen)}
            {row('Source', `${c.source.title}${c.source.author ? ` · ${c.source.author}` : ''}${c.source.kind === 'lichess' ? ' · Lichess' : ''}`)}
            {row('Game', `${players} (${c.gameId})`)}
            {row('Chapter', `Chapter ${c.chapter ?? '—'}`)}
            {row('Move', `${move} (ply ${c.ply})`)}
            {row('Language', langName(c.lang))}
          </dl>
        </div>
        <h3 className="mt-3 font-semibold">Original text</h3>
        <p className="whitespace-pre-line rounded bg-slate-50 p-2"><LinkedText text={c.text} /></p>
        {fields.map((f) => (
          <div key={f.key} className="mt-2">
            <label className="flex items-center gap-2 font-semibold" htmlFor={`field-${f.key}`}>{f.label}</label>
            <textarea id={`field-${f.key}`} aria-label={f.label} rows={3} className="w-full rounded border border-slate-300 px-2 py-1" value={values[f.key]}
              onChange={(e) => { setValues((v) => ({ ...v, [f.key]: e.target.value })); setGenerated((g) => Object.fromEntries(Object.entries(g).filter(([k]) => k !== f.key))) }} />
            {llm.available && (
              <button className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40" disabled={busy !== null} aria-label={`Generate ${f.label === 'Universal text' ? 'universal text' : f.label} with AI`} onClick={() => void generate(f)}>
                {busy === f.key ? 'Asking the model…' : 'Generate with AI'}
              </button>
            )}
          </div>
        ))}
        {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
        <p className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <OpenGameButton className="rounded border border-slate-300 px-3 py-1" game={{ gameId: c.gameId, annotator: c.source.title, white: c.game.white, black: c.game.black, label: c.game.label }} />
          <DeleteControl className="mr-auto" onConfirm={async () => { await hideComment(c.id); onHidden?.(); onClose() }} />
          <button className="rounded bg-violet-700 px-3 py-1 text-white disabled:opacity-40" disabled={busy !== null} onClick={() => void save()}>Save</button>
          <button className="rounded border border-slate-300 px-3 py-1" onClick={onClose}>Cancel</button>
        </p>
      </div>
    </div>
  )
}

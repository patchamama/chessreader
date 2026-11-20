import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lookupPositionComments, type HumanComment } from '../library/commentdb/commentLookup'
import { boardSvgDataUrl } from '../library/utils/boardSvg'
import { createEngineAnalyser, type AnalysePosition } from '../library/review/reviewEngine'
import { hideComment, loadTopPositions, moveLabel, type CommentEntry, type CommentFilter, type CommentSource, type TopPosition } from '../comments/commentsApi'
import CommentCard from './CommentCard'
import CommentDetailsModal from './CommentDetailsModal'
import { createEvaluator, evaluateAll, formatEval, type PositionEval } from './positionEval'
import { entryOf } from './positionInput'

/** How many positions the ranking lists. */
export const RANKING_SIZE = 50
const SAMPLE_CHARS = 140

const truncate = (t: string) => (t.length > SAMPLE_CHARS ? `${t.slice(0, SAMPLE_CHARS).trimEnd()}…` : t)
const sideToMove = (fen: string) => (fen.split(' ')[1] === 'b' ? 'Black' : 'White')

/**
 * Database → Comments → Ranking (S23): the most commented positions under the filters of the
 * tab, each with its diagram, number of comments, sources, sample comments and the engine's
 * evaluation (computed one position at a time, remembered by FEN). A row opens in Find by
 * position or expands its comments, which can be edited and hidden.
 */
export default function RankingView({ filter, sources = [], analyse, onOpenInFinder }: {
  filter: CommentFilter
  sources?: CommentSource[]
  /** The engine; absent: the browser's own, created on first use. */
  analyse?: AnalysePosition
  onOpenInFinder: (fen: string) => void
}) {
  const [rows, setRows] = useState<TopPosition[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [evals, setEvals] = useState<Record<string, PositionEval | 'na'>>({})
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [open, setOpen] = useState<Record<string, HumanComment[] | 'loading'>>({})
  const [editing, setEditing] = useState<{ entry: CommentEntry; fen: string } | null>(null)
  const ownEngine = useRef<ReturnType<typeof createEngineAnalyser> | null>(null)
  const filterKey = JSON.stringify(filter)

  useEffect(() => {
    let live = true
    setRows(null)
    setError(null)
    setOpen({})
    loadTopPositions(JSON.parse(filterKey) as CommentFilter, RANKING_SIZE).then(
      (r) => { if (live) setRows(r) },
      (e: Error) => { if (live) setError(`The ranking could not be read: ${e.message}`) })
    return () => { live = false }
  }, [filterKey, reload])

  const evaluator = useMemo(() => {
    let fn = analyse
    if (!fn) {
      const lazy: AnalysePosition = (fen, depth, count) => {
        ownEngine.current ??= createEngineAnalyser()
        return ownEngine.current.analyse(fen, depth, count)
      }
      fn = lazy
    }
    return createEvaluator(fn)
  }, [analyse])
  useEffect(() => () => { ownEngine.current?.dispose(); ownEngine.current = null }, [])

  // The evaluations: remembered ones at once, the rest one at a time; a new list or leaving cancels.
  useEffect(() => {
    setEvals({})
    setProgress(null)
    if (!rows?.length) return
    const ctl = new AbortController()
    const known: Record<string, PositionEval> = {}
    for (const r of rows) { const c = evaluator.cached(r.fen); if (c) known[r.fen] = c }
    setEvals(known)
    const todo = rows.map((r) => r.fen).filter((f) => !known[f])
    const base = rows.length - todo.length
    if (!todo.length) return
    setProgress({ done: base, total: rows.length })
    void evaluateAll(todo, evaluator, {
      signal: ctl.signal,
      onResult: (fen, e, done) => {
        setEvals((m) => ({ ...m, [fen]: e ?? 'na' }))
        setProgress(base + done >= rows.length ? null : { done: base + done, total: rows.length })
      },
    })
    return () => ctl.abort()
  }, [rows, evaluator])

  const toggle = useCallback(async (fen: string) => {
    if (open[fen]) { setOpen((o) => { const n = { ...o }; delete n[fen]; return n }); return }
    setOpen((o) => ({ ...o, [fen]: 'loading' }))
    try {
      const comments = await lookupPositionComments(fen)
      setOpen((o) => ({ ...o, [fen]: comments }))
    } catch {
      setOpen((o) => ({ ...o, [fen]: [] }))
    }
  }, [open])

  const hide = async (c: HumanComment, fen: string) => {
    if (c.id === undefined) throw new Error('This comment has no id in the database, so it cannot be hidden here.')
    await hideComment(c.id)
    setOpen((o) => ({ ...o, [fen]: Array.isArray(o[fen]) ? (o[fen] as HumanComment[]).filter((x) => x.id !== c.id) : o[fen] }))
  }

  const evalCell = (fen: string) => {
    const e = evals[fen]
    if (e === 'na') return <span title="The engine is not available" className="text-slate-500">n/a</span>
    if (!e) return <span title="Evaluating…" className="text-slate-500">…</span>
    return <span title={`Depth ${e.depth}`} className="font-mono font-semibold">{formatEval(e)}</span>
  }
  const btn = 'rounded border border-slate-300 px-2 py-0.5 text-xs'
  return (
    <section aria-label="Most commented positions" className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Top {RANKING_SIZE}{rows ? ` · ${rows.length} positions` : ''}</h3>
        <button className={btn} onClick={() => setReload((n) => n + 1)}>Reload</button>
        {progress && <span role="status" className="text-xs text-slate-600">Evaluating {Math.min(progress.done + 1, progress.total)} of {progress.total}</span>}
      </div>
      {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
      {!rows && !error && <p className="mt-2 text-slate-600">Reading the ranking…</p>}
      {rows && rows.length === 0 && <p className="mt-2 text-slate-600">No commented positions for these filters.</p>}
      <ol aria-label="Ranking" className="mt-2 flex flex-col gap-2">
        {rows?.map((r) => {
          const comments = open[r.fen]
          return (
            <li key={r.fen} aria-label={`Rank ${r.rank}`} className="rounded border border-slate-200 bg-white p-2">
              <div className="flex gap-3">
                <span className="w-8 shrink-0 text-right text-lg font-semibold text-slate-500">{r.rank}</span>
                <div className="shrink-0">
                  <img src={boardSvgDataUrl(r.fen)} alt={`Position ranked ${r.rank}`} width={128} height={128} loading="lazy" className="h-32 w-32 rounded" />
                  <p className="text-center text-xs text-slate-600">{sideToMove(r.fen)} to move</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-3">
                    <strong>{r.count} {r.count === 1 ? 'comment' : 'comments'}</strong>
                    <span className="text-xs">Evaluation: {evalCell(r.fen)}</span>
                  </p>
                  <ul aria-label={`Sources of rank ${r.rank}`} className="mt-1 text-xs">
                    {r.sources.map((s) => (
                      <li key={s.id}>
                        {s.title}{s.author ? ` · ${s.author}` : ''} — {s.count}{' '}
                        <span className="rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-600">{s.kind}</span>
                      </li>
                    ))}
                  </ul>
                  <ul aria-label={`Samples of rank ${r.rank}`} className="mt-1 flex flex-col gap-0.5 text-xs text-slate-700">
                    {r.samples.slice(0, 3).map((x) => <li key={x.id}><span className="font-mono">{moveLabel(x)}</span> {truncate(x.text)}</li>)}
                  </ul>
                  <p className="mt-1 flex flex-wrap gap-1">
                    <button className={btn} onClick={() => onOpenInFinder(r.fen)}>Open in Find by position</button>
                    <button className={btn} aria-expanded={!!comments} onClick={() => void toggle(r.fen)}>{comments ? 'Hide comments' : 'Show comments'}</button>
                  </p>
                </div>
              </div>
              {comments === 'loading' && <p className="mt-1 text-xs text-slate-600">Reading the comments…</p>}
              {Array.isArray(comments) && (
                <ul aria-label={`Comments of rank ${r.rank}`} className="mt-2 flex flex-col gap-2">
                  {comments.map((c, i) => (
                    <CommentCard key={`${c.id ?? ''}-${i}`} comment={c} fen={r.fen}
                      onEdit={(x) => setEditing({ entry: entryOf(x, r.fen, sources), fen: r.fen })} onDelete={(x) => hide(x, r.fen)} />
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
      {editing && <CommentDetailsModal comment={editing.entry} onClose={() => setEditing(null)}
        onHidden={() => setOpen((o) => ({ ...o, [editing.fen]: Array.isArray(o[editing.fen]) ? (o[editing.fen] as HumanComment[]).filter((x) => x.id !== editing.entry.id) : o[editing.fen] }))} />}
    </section>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLlm } from '../../shared/llm'
import { withBusy, withProgress } from '../../shared/layout/busyStore'
import { boardSvgDataUrl } from '../library/utils/boardSvg'
import { hideComment, restoreComment, loadCommentPage, loadCommentSources, moveLabel, type CommentEntry, type CommentFilter, type CommentSource } from '../comments/commentsApi'
import { langName, TARGET_LANGS, type TargetLang } from '../comments/commentPrompts'
import {
  proposeComment, proposeGameTranslation, runPagedBatch, saveCommentProposal, saveGameProposal,
  type BatchProgress, type CommentAction, type CommentProposal, type GameProposal,
} from '../comments/commentAi'
import type { SaveSuggestionResult } from '../suggestions/suggestionsApi'
import { openGameInBook } from './openInBook'
import { openCommentGame } from './openCommentGame'
import LinkedText from '../../shared/ui/LinkedText'
import { matchSource } from '../library/stats/sourceMatch'
import BatchProgressBar from './BatchProgressBar'
import PositionFinder from './PositionFinder'
import RankingView from './RankingView'
import CommentDetailsModal from './CommentDetailsModal'
import DeleteControl from './DeleteControl'

const PAGE = 50
const LANG_OPTIONS = ['es', 'en', 'de', 'fr']

type Proposal =
  | { kind: 'comment'; action: CommentAction; proposal: CommentProposal }
  | { kind: 'game'; proposal: GameProposal }
interface RowState { busy?: boolean; error?: string; proposal?: Proposal; saved?: SaveSuggestionResult }

const playersOf = (c: CommentEntry) => [c.game.white, c.game.black].filter(Boolean).join(' – ') || c.game.label || `Game ${c.gameId}`

function copy(text: string) {
  try { void navigator.clipboard?.writeText(text) } catch { /* no clipboard */ }
}

const downloadHref = (json: string) => `data:application/json;charset=utf-8,${encodeURIComponent(json)}`
const fileOf = (path: string) => path.split('/').pop() ?? 'suggestion.json'

function SavedNote({ saved }: { saved: SaveSuggestionResult }) {
  if (saved.saved) return <p className="text-xs text-green-700">Saved to the {saved.where === 'server' ? 'server' : 'resources'} as a pending suggestion.</p>
  return (
    <p className="text-xs text-amber-800">
      Not stored{saved.reason ? ` (${saved.reason})` : ''}: <a className="underline" href={downloadHref(saved.json)} download={fileOf(saved.path)}>Download the suggestion</a> and add it to the resources at {saved.path}.
    </p>
  )
}

/**
 * Database → Comments (S2, S3): every comment of the commentary database with
 * its position, source, move, chapter and ids; open its game or its book; with
 * the AI, make it universal or translate it (Test, then Save as a suggestion),
 * one by one or in batch.
 */
export default function CommentsTab({ books, initialBook }: { books: { id: string; title: string }[]; /** A book to filter by on opening (its title), e.g. from the library. */ initialBook?: string }) {
  const navigate = useNavigate()
  const llm = useLlm()
  const [filter, setFilter] = useState<Required<Pick<CommentFilter, 'q' | 'lang' | 'kind'>> & { source: number }>({ q: '', source: 0, lang: '', kind: '' })
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<{ total: number; comments: CommentEntry[] } | null>(null)
  const [sources, setSources] = useState<CommentSource[]>([])
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<number, RowState>>({})
  const [lang, setLang] = useState<Record<number, TargetLang>>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [batchAction, setBatchAction] = useState('universal')
  const [details, setDetails] = useState<CommentEntry | null>(null)
  const [view, setView] = useState<'list' | 'ranking'>('list')
  const [finderRequest, setFinderRequest] = useState<{ fen: string; key: number } | undefined>()
  const [hiddenView, setHiddenView] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [allMatching, setAllMatching] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  const [running, setRunning] = useState(false)
  const cancelBatch = useRef<() => void>(() => {})

  useEffect(() => { loadCommentSources().then(setSources, () => setSources([])) }, [])
  // Opened from a book: show the comments of the source named like it.
  const filtered = useRef(false)
  useEffect(() => {
    if (!initialBook || filtered.current || !sources.length) return
    filtered.current = true
    const hit = matchSource(sources, initialBook)
    if (hit) setFilter((f) => ({ ...f, source: hit.id }))
  }, [initialBook, sources])
  const cleanFilter = useCallback((): CommentFilter => {
    const f: CommentFilter = { q: filter.q, ...(filter.source ? { source: filter.source } : {}), lang: filter.lang, kind: filter.kind, ...(hiddenView ? { hidden: true } : {}) }
    return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined)) as CommentFilter
  }, [filter, hiddenView])
  useEffect(() => {
    let live = true
    const clean = cleanFilter()
    loadCommentPage(clean, offset, PAGE).then((p) => { if (live) { setPage(p); setError(null) } }, (e: Error) => { if (live) setError(`The comments could not be read: ${e.message}`) })
    return () => { live = false }
  }, [cleanFilter, offset])

  const rankingFilter = useMemo<CommentFilter>(() => { const f = { ...cleanFilter() }; delete f.hidden; return f }, [cleanFilter])
  const change = (patch: Partial<typeof filter>) => {
    setFilter((f) => ({ ...f, ...patch }))
    setOffset(0)
    setSelected(new Set())
    setAllMatching(false)
  }
  const patchRow = (id: number, patch: RowState) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }))
  const targetOf = (c: CommentEntry): TargetLang => lang[c.id] ?? (c.lang === 'es' ? 'en' : 'es')

  const bookOf = (c: CommentEntry) => {
    if (c.source.kind !== 'book') return null
    const id = c.source.book ?? books.find((b) => b.title.trim().toLocaleLowerCase() === c.source.title.trim().toLocaleLowerCase())?.id
    return id ? { id, title: c.source.title, author: c.source.author, lang: c.source.lang } : null
  }

  const openGame = (c: CommentEntry) => withBusy('Opening the game', async () => {
    try {
      navigate(await openCommentGame({ gameId: c.gameId, annotator: c.source.title, white: c.game.white, black: c.game.black, label: c.game.label }))
    } catch (e) {
      setError(`Game ${c.gameId}: ${(e as Error).message}`)
    }
  })

  const openBook = (c: CommentEntry) => withBusy('Opening the book', async () => {
    const b = bookOf(c)
    if (!b || !c.chapter) return
    try {
      navigate(await openGameInBook(b, { chapter: c.chapter, gameIndex: null }))
    } catch (e) {
      setError(`${b.title}: ${(e as Error).message}`)
    }
  })

  const test = async (c: CommentEntry, run: () => Promise<Proposal>) => {
    patchRow(c.id, { busy: true, error: undefined, proposal: undefined, saved: undefined })
    try {
      patchRow(c.id, { busy: false, proposal: await run() })
    } catch (e) {
      patchRow(c.id, { busy: false, error: (e as Error).message })
    }
  }
  const testComment = (c: CommentEntry, action: CommentAction) =>
    test(c, async () => ({ kind: 'comment', action, proposal: await proposeComment(llm.complete, c, action) }))
  const testGame = (c: CommentEntry) =>
    test(c, async () => ({ kind: 'game', proposal: await proposeGameTranslation(llm.complete, c, targetOf(c)) }))
  const save = async (c: CommentEntry, p: Proposal) => {
    patchRow(c.id, { busy: true })
    try {
      const saved = p.kind === 'comment' ? await saveCommentProposal(c, p.action, p.proposal) : await saveGameProposal(c, p.proposal)
      patchRow(c.id, { busy: false, saved })
    } catch (e) {
      patchRow(c.id, { busy: false, error: (e as Error).message })
    }
  }

  const dropDeleted = (id: number) => {
    setPage((p) => (p ? { total: Math.max(0, p.total - 1), comments: p.comments.filter((x) => x.id !== id) } : p))
    setSelected((s) => { const n = new Set(s); n.delete(id); return n })
    setNotice(hiddenView ? 'Comment restored' : 'Comment hidden')
  }
  const comments = page?.comments ?? []
  const allSelected = comments.length > 0 && comments.every((c) => selected.has(c.id))
  const toggle = (id: number) => { setAllMatching(false); setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }) }
  const runBatch = async () => {
    const [kind, code] = batchAction.split(':')
    const target = code as TargetLang
    const actions: CommentAction[] = kind === 'universal' ? [{ kind: 'universal' }] : kind === 'both' ? [{ kind: 'universal' }, { kind: 'translate', lang: target }] : [{ kind: 'translate', lang: target }]
    const label = kind === 'universal' ? 'Making comments universal' : kind === 'both' ? `Making comments universal and translating to ${langName(target)}` : `Translating comments to ${langName(target)}`
    const chosen = comments.filter((c) => selected.has(c.id))
    const f = cleanFilter()
    // Everything matching the filter is read lazily, page by page; the selected rows of the page are already in memory.
    const loadPage = allMatching
      ? (o: number, l: number) => loadCommentPage(f, o, l)
      : async (o: number, l: number) => ({ total: chosen.length, comments: chosen.slice(o, o + l) })
    setProgress({ saved: 0, flagged: 0, failed: 0, unsaved: [], cancelled: false, done: 0, total: allMatching ? page?.total ?? 0 : chosen.length, skipped: 0 })
    setRunning(true)
    try {
      await withProgress(label, async (report, signal) => {
        const own = new AbortController()
        signal.addEventListener('abort', () => own.abort())
        cancelBatch.current = () => own.abort()
        const result = await runPagedBatch(llm.complete, loadPage, { actions, overwrite, pageSize: PAGE, signal: own.signal, report, onProgress: setProgress })
        setProgress(result)
      }, { cancellable: true })
    } finally {
      setRunning(false)
    }
  }
  const selectedCount = allMatching ? page?.total ?? 0 : selected.size

  const input = 'rounded border border-slate-300 px-2 py-1'
  const button = 'rounded border border-slate-300 px-2 py-0.5 disabled:opacity-40'
  return (
    <div className="text-sm">
      <PositionFinder filter={filter} sources={sources} request={finderRequest} />
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Search comments" placeholder="Search comments" className={input} value={filter.q} onChange={(e) => change({ q: e.target.value })} />
        <select aria-label="Source" className={input} value={filter.source} onChange={(e) => change({ source: Number(e.target.value) })}>
          <option value={0}>All books and studies</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.title}{s.comments !== undefined ? ` (${s.comments})` : ''}</option>)}
        </select>
        <select aria-label="Language" className={input} value={filter.lang} onChange={(e) => change({ lang: e.target.value })}>
          <option value="">All languages</option>
          {LANG_OPTIONS.map((l) => <option key={l} value={l}>{langName(l)}</option>)}
        </select>
        <select aria-label="Origin" className={input} value={filter.kind} onChange={(e) => change({ kind: e.target.value })}>
          <option value="">Books and Lichess</option>
          <option value="book">Books</option>
          <option value="lichess">Lichess</option>
        </select>
        <span role="group" aria-label="View" className="inline-flex overflow-hidden rounded border border-slate-300 text-xs">
          <button className={`px-2 py-1 ${view === 'list' ? 'bg-violet-100 font-semibold' : 'bg-white'}`} aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
          <button className={`px-2 py-1 ${view === 'ranking' ? 'bg-violet-100 font-semibold' : 'bg-white'}`} aria-pressed={view === 'ranking'} onClick={() => setView('ranking')}>Most commented positions</button>
        </span>
        {view === 'list' && <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" aria-label="Show hidden comments" checked={hiddenView} onChange={(e) => { setHiddenView(e.target.checked); setOffset(0); setSelected(new Set()); setAllMatching(false); setNotice(null) }} />
          Show hidden comments
        </label>}
        {view === 'list' && page && <span className="text-xs text-slate-500">{page.total ? `${offset + 1}–${offset + comments.length} of ${page.total}` : 'No comments'}</span>}
        {view === 'list' && <button className={button} aria-label="Previous page" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>←</button>}
        {view === 'list' && <button className={button} aria-label="Next page" disabled={!page || offset + PAGE >= page.total} onClick={() => setOffset(offset + PAGE)}>→</button>}
      </div>
      {view === 'ranking' ? (
        <RankingView filter={rankingFilter} sources={sources} onOpenInFinder={(fen) => setFinderRequest((r) => ({ fen, key: (r?.key ?? 0) + 1 }))} />
      ) : (<>
      {llm.available && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" aria-label="Select the page" checked={allSelected} onChange={() => { setAllMatching(false); setSelected(allSelected ? new Set() : new Set(comments.map((c) => c.id))) }} />
            Select the page
          </label>
          <select aria-label="Batch action" className="rounded border border-slate-300 px-1" value={batchAction} onChange={(e) => setBatchAction(e.target.value)}>
            <option value="universal">Make universal</option>
            {TARGET_LANGS.map((l) => <option key={l} value={`translate:${l}`}>Translate to {langName(l)}</option>)}
            {TARGET_LANGS.map((l) => <option key={l} value={`both:${l}`}>Universal + translate to {langName(l)}</option>)}
          </select>
          {page && page.total > comments.length && !allMatching && (
            <button className={button} onClick={() => { setAllMatching(true); setSelected(new Set()) }}>Select all {page.total} matching the filter</button>
          )}
          <label className="flex items-center gap-1">
            <input type="checkbox" aria-label="Overwrite existing translations" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            Overwrite existing translations
          </label>
          <button className={button} disabled={selectedCount === 0 || running} onClick={() => void runBatch()}>Run on {selectedCount} {allMatching ? 'matching' : 'selected'}</button>
          {progress && <BatchProgressBar progress={progress} running={running} onCancel={() => cancelBatch.current()} />}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-2 text-green-700">{notice}</p>}
      <ul className="mt-3 flex flex-col gap-2" aria-label="Comments">
        {comments.map((c) => {
          const move = moveLabel(c)
          const state = rows[c.id] ?? {}
          const inBook = bookOf(c)
          return (
            <li key={c.id} aria-label={`Comment ${c.id}`} className="rounded border border-slate-200 bg-white p-2">
              <div className="flex gap-3">
                {llm.available && <input type="checkbox" aria-label={`Select comment ${c.id}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="self-start" />}
                <img src={boardSvgDataUrl(c.fen)} alt={`Position after ${move}`} loading="lazy" width={96} height={96} className="h-24 w-24 shrink-0 rounded" />
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-line"><LinkedText text={c.text} /></p>
                  <p className="mt-1 text-xs text-slate-600">
                    <strong>{c.source.title}</strong>{c.source.author ? ` · ${c.source.author}` : ''}{c.source.kind === 'lichess' ? ' · Lichess' : ''}
                    {' · '}{playersOf(c)} · <span className="font-mono">{move}</span> · Chapter {c.chapter ?? '—'} · {langName(c.lang)}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1 text-xs">
                    <button className={button} aria-label={`Copy comment id ${c.id}`} title="Copy" onClick={() => copy(String(c.id))}>Comment #{c.id}</button>
                    <button className={button} aria-label={`Copy game id ${c.gameId}`} title="Copy" onClick={() => copy(c.gameId)}>Game {c.gameId}</button>
                    <button className={button} onClick={() => setDetails(c)}>Details</button>
                    {hiddenView
                      ? <button className={button} onClick={() => void restoreComment(c.id).then(() => dropDeleted(c.id), (e: Error) => setError(`Comment ${c.id}: ${e.message}`))}>Restore</button>
                      : <DeleteControl onConfirm={async () => { await hideComment(c.id); dropDeleted(c.id) }} />}
                    <button className={button} onClick={() => void openGame(c)}>Open the game</button>
                    <button className={button} disabled={!inBook || !c.chapter} title={!inBook ? 'Not from a book' : !c.chapter ? 'The chapter is unknown' : undefined} onClick={() => void openBook(c)}>Open in the book</button>
                  </p>
                  {llm.available && (
                    <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                      <button className={button} disabled={state.busy} onClick={() => void testComment(c, { kind: 'universal' })}>Make universal</button>
                      <select aria-label="Translate to" className="rounded border border-slate-300 px-1" value={targetOf(c)} onChange={(e) => setLang((l) => ({ ...l, [c.id]: e.target.value as TargetLang }))}>
                        {TARGET_LANGS.map((l) => <option key={l} value={l}>{langName(l)}</option>)}
                      </select>
                      <button className={button} disabled={state.busy} onClick={() => void testComment(c, { kind: 'translate', lang: targetOf(c) })}>Translate</button>
                      <button className={button} disabled={state.busy} onClick={() => void testGame(c)}>Translate the game</button>
                      {state.busy && <span className="text-slate-500">Asking the model…</span>}
                    </p>
                  )}
                  {state.error && <p role="alert" className="mt-1 text-xs text-red-700">{state.error}</p>}
                  {state.proposal && (
                    <section aria-label={`Proposal for comment ${c.id}`} className="mt-2 rounded border border-violet-200 bg-violet-50 p-2 text-xs">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <h4 className="font-semibold">Original</h4>
                          <p className="whitespace-pre-wrap">{state.proposal.kind === 'comment' ? c.text : state.proposal.proposal.before}</p>
                        </div>
                        <div>
                          <h4 className="font-semibold">Proposal ({langName(state.proposal.proposal.lang)} · {state.proposal.proposal.model})</h4>
                          <p className="whitespace-pre-wrap">{state.proposal.kind === 'comment' ? state.proposal.proposal.text : state.proposal.proposal.after}</p>
                        </div>
                      </div>
                      {state.proposal.proposal.problems.length > 0 && (
                        <ul role="alert" className="mt-1 list-disc pl-4 text-amber-800">{state.proposal.proposal.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                      )}
                      {state.saved ? <SavedNote saved={state.saved} /> : (
                        <p className="mt-1 flex gap-1">
                          <button className="rounded bg-violet-700 px-2 py-0.5 text-white disabled:opacity-40" disabled={state.busy} onClick={() => void save(c, state.proposal!)}>Save</button>
                          <button className={button} onClick={() => patchRow(c.id, { proposal: undefined })}>Discard</button>
                        </p>
                      )}
                    </section>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
        </>)}
      {details && <CommentDetailsModal comment={details} onClose={() => setDetails(null)} onHidden={() => dropDeleted(details.id)}
        onSaved={(t) => setPage((p) => p && { ...p, comments: p.comments.map((x) => (x.id === details.id ? { ...x, translations: { ...x.translations, ...t } } : x)) })} />}
    </div>
  )
}

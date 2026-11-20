import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBooks } from '../library/api/libraryApi'
import { saveProgress } from '../library/store/readingStore'
import { saveBoardMemory } from '../library/store/boardMemory'
import { boardSvgDataUrl } from '../library/utils/boardSvg'
import { bookSlug } from '../library/errata/errataFormat'
import { hasServerSession } from '../../shared/api/serverSession'
import { isLocalhostHost } from '../../shared/env/devMode'
import { withBusy, withProgress } from '../../shared/layout/busyStore'
import { useAuthStore } from '../auth/store/authStore'
import { loadSuggestions, updateSuggestionStatus } from '../suggestions/suggestionsApi'
import {
  SUGGESTION_KINDS, SUGGESTION_STATUSES,
  type LoadedSuggestion, type SuggestionKind, type SuggestionOrigin, type SuggestionStatus,
} from '../suggestions/suggestionFormat'
import { loadErrataForReview, type ErrataReviewEntry } from '../suggestions/errataReview'
import { applySuggestionsToEpub, authBlobUrl, isProtectedAsset, restoreBackup, type ApplyResult } from '../suggestions/epubApi'
import { textDiff } from '../suggestions/textDiff'

/** Kinds that "Apply to EPUB" writes into the book. */
const EPUB_KINDS = new Set<SuggestionKind>(['text', 'insert', 'image', 'diagram-fen', 'cover'])
const FEN = /^([1-8pnbrqkPNBRQK]{1,8}\/){7}[1-8pnbrqkPNBRQK]{1,8}(\s[wb](\s\S+){0,4})?$/

interface Filters {
  kind: '' | SuggestionKind
  book: string
  status: '' | SuggestionStatus
  origin: '' | SuggestionOrigin
}

type LibraryBook = { id: number; title: string }

/** A field of a before/after value: the value itself when it is a string, else value[key]. */
function field(v: unknown, ...keys: string[]): string | null {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    for (const k of keys) {
      const x = (v as Record<string, unknown>)[k]
      if (typeof x === 'string') return x
    }
  }
  return null
}

const asText = (v: unknown): string => {
  if (v == null) return ''
  return field(v, 'text', 'html', 'comment', 'pgn', 'translation') ?? JSON.stringify(v)
}

/** An image of a suggestion: uploaded images are read with the token (blob URL), others as they are. */
function SuggestionImage({ src, alt }: { src: string | null; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const protectedAsset = !!src && isProtectedAsset(src)
  useEffect(() => {
    if (!src || !protectedAsset) return
    let revoked = false
    let made: string | null = null
    authBlobUrl(src).then((u) => {
      if (revoked) URL.revokeObjectURL(u)
      else { made = u; setUrl(u) }
    }, () => setFailed(true))
    return () => { revoked = true; if (made) URL.revokeObjectURL(made) }
  }, [src, protectedAsset])
  if (!src) return <span className="text-xs text-slate-400">none</span>
  if (failed) return <span className="text-xs text-red-600">could not load the image</span>
  const shown = protectedAsset ? url : src
  return shown ? <img src={shown} alt={alt} className="max-h-40 max-w-[12rem] rounded border border-slate-200 bg-white object-contain" /> : <span className="text-xs text-slate-400">loading…</span>
}

function TextDiffView({ before, after }: { before: string; after: string }) {
  return (
    <p className="whitespace-pre-wrap text-xs leading-relaxed" aria-label="Changes">
      {textDiff(before, after).map((p, i) => (
        p.type === 'same' ? <span key={i}>{p.text}</span>
          : p.type === 'removed' ? <del key={i} className="bg-red-100 text-red-800">{p.text}</del>
            : <ins key={i} className="bg-green-100 text-green-800 no-underline">{p.text}</ins>
      ))}
    </p>
  )
}

/** The book image a cover suggestion picked inside the EPUB, as a URL of the image route. */
const bookImageUrl = (bookId: number | undefined, path: string) =>
  bookId ? `/api/library/books/${bookId}/images/${path.split('/').map(encodeURIComponent).join('/')}` : null

function BeforeAfter({ s, bookId }: { s: LoadedSuggestion; bookId?: number }) {
  if (s.kind === 'image') {
    return (
      <div className="flex flex-wrap gap-3">
        <figure><figcaption className="text-[10px] text-slate-500">Before</figcaption><SuggestionImage src={field(s.before, 'src') ?? s.target.image ?? null} alt="Image before" /></figure>
        <figure><figcaption className="text-[10px] text-slate-500">After</figcaption><SuggestionImage src={field(s.after, 'src')} alt="Image after" /></figure>
      </div>
    )
  }
  if (s.kind === 'cover') {
    const picked = field(s.after, 'epubPath')
    const after = field(s.after, 'src') ?? (picked ? bookImageUrl(bookId, picked) : null)
    return (
      <div className="flex flex-wrap gap-3">
        <figure><figcaption className="text-[10px] text-slate-500">Current cover</figcaption><SuggestionImage src={field(s.before, 'src') ?? (bookId ? `/api/library/books/${bookId}/cover` : null)} alt="Cover before" /></figure>
        <figure><figcaption className="text-[10px] text-slate-500">New cover</figcaption><SuggestionImage src={after} alt="Cover after" /></figure>
      </div>
    )
  }
  if (s.kind === 'diagram-fen') {
    const fen = field(s.after, 'fen')?.trim() ?? ''
    return (
      <div className="flex flex-wrap gap-3">
        <figure><figcaption className="text-[10px] text-slate-500">Diagram</figcaption><SuggestionImage src={s.target.image ?? null} alt="Diagram image" /></figure>
        <figure>
          <figcaption className="text-[10px] text-slate-500">FEN {fen}</figcaption>
          {FEN.test(fen) ? <img src={boardSvgDataUrl(fen)} alt={`Position ${fen}`} className="h-40 w-40" /> : <span className="text-xs text-red-600">not a valid FEN</span>}
        </figure>
      </div>
    )
  }
  return <TextDiffView before={asText(s.before)} after={asText(s.after)} />
}

/**
 * The review of suggestions (Errors → Suggestions): the suggestions of the
 * backend database and of the resources repository, merged, plus the errata
 * (kind 'move', read-only). Filters by kind, book, status and origin; each
 * one shows its before/after; one or a selection is accepted or rejected
 * (review is the admin's on the server). Accepted ones are written into the
 * book with "Apply to EPUB" (server, admin; backed up first, with undo) or,
 * in the deploy, their status is committed to the resources repository.
 */
export default function SuggestionsReview() {
  const navigate = useNavigate()
  const { data: libraryBooks } = useBooks()
  const token = useAuthStore((s) => s.token)
  const role = useAuthStore((s) => s.user?.role)
  const server = hasServerSession()
  const isAdmin = role === 'admin' || (!token && isLocalhostHost())
  const [items, setItems] = useState<LoadedSuggestion[] | null>(null)
  const [errata, setErrata] = useState<ErrataReviewEntry[]>([])
  const [filters, setFilters] = useState<Filters>({ kind: '', book: '', status: '', origin: '' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [lastApply, setLastApply] = useState<{ book: LibraryBook; result: ApplyResult } | null>(null)

  const books: LibraryBook[] = useMemo(() => (libraryBooks ?? []).map((b) => ({ id: b.id, title: b.title })), [libraryBooks])
  const bookBySlug = useMemo(() => new Map(books.map((b) => [bookSlug(b.title), b])), [books])

  const reload = useCallback(async () => {
    const [list, moves] = await Promise.all([loadSuggestions({}), loadErrataForReview(books.map((b) => b.title))])
    setItems(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    setErrata(moves)
    setSelected(new Set())
  }, [books])

  useEffect(() => { void reload() }, [reload])

  const bookOptions = useMemo(() => {
    const titles = new Map<string, string>()
    for (const s of items ?? []) titles.set(bookSlug(s.target.book), s.target.book)
    for (const e of errata) titles.set(bookSlug(e.book.title), e.book.title)
    return [...titles.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [items, errata])

  const shown = (items ?? []).filter((s) => (!filters.kind || s.kind === filters.kind)
    && (!filters.book || bookSlug(s.target.book) === filters.book)
    && (!filters.status || s.status === filters.status)
    && (!filters.origin || s.origins.includes(filters.origin)))
  const shownErrata = errata.filter((e) => (!filters.kind || filters.kind === 'move')
    && (!filters.book || bookSlug(e.book.title) === filters.book)
    && (!filters.status || filters.status === 'accepted')
    && (!filters.origin || e.origin === filters.origin))

  const toggle = (id: string) => setSelected((cur) => {
    const next = new Set(cur)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const allSelected = shown.length > 0 && shown.every((s) => selected.has(s.id))

  const review = async (status: SuggestionStatus) => {
    const chosen = shown.filter((s) => selected.has(s.id))
    if (!chosen.length) return
    const failed: string[] = []
    const changed = new Map<string, SuggestionStatus>()
    await withProgress(`${status === 'accepted' ? 'Accepting' : 'Rejecting'} ${chosen.length} suggestion(s)`, async (report, signal) => {
      for (let i = 0; i < chosen.length; i++) {
        if (signal.aborted) break
        const r = await updateSuggestionStatus(chosen[i], status)
        if (r.ok) changed.set(chosen[i].id, status)
        else failed.push(`${chosen[i].id}: ${r.reason ?? 'not stored anywhere'}`)
        report(i + 1, chosen.length)
      }
    }, { cancellable: true })
    setItems((cur) => (cur ?? []).map((s) => (changed.has(s.id) ? { ...s, status: changed.get(s.id)! } : s)))
    setSelected(new Set())
    setMessage(`${changed.size} ${status}${failed.length ? `; ${failed.length} could not be changed: ${failed.join('; ')}` : ''}`)
  }

  const commitStatus = async (s: LoadedSuggestion) => {
    const r = await withBusy('Committing the status to the resources repository…', () => updateSuggestionStatus(s, s.status))
    setMessage(r.ok ? `${s.id}: status committed (${r.updated.join(', ')})` : `${s.id}: could not commit — ${r.reason ?? 'no write token for the resources repository in Settings'}`)
  }

  // Accepted suggestions that "Apply to EPUB" writes, per library book.
  const applicable = useMemo(() => {
    const per = new Map<number, { book: LibraryBook; count: number }>()
    for (const s of items ?? []) {
      if (s.status !== 'accepted' || !EPUB_KINDS.has(s.kind) || !s.origins.includes('server')) continue
      const book = bookBySlug.get(bookSlug(s.target.book))
      if (!book) continue
      const entry = per.get(book.id) ?? { book, count: 0 }
      entry.count++
      per.set(book.id, entry)
    }
    return [...per.values()]
  }, [items, bookBySlug])

  const apply = async (book: LibraryBook) => {
    try {
      const result = await withBusy(`Writing the accepted suggestions into ${book.title}…`, () => applySuggestionsToEpub(book.id))
      setLastApply({ book, result })
      setMessage(`${book.title}: ${result.applied.length} applied, ${result.stale.length} stale${result.backup ? ` · backup ${result.backup}` : ''}`)
      await reload()
    } catch (e) {
      setMessage(`${book.title}: ${(e as Error).message}`)
    }
  }

  const undo = async () => {
    if (!lastApply?.result.backup) return
    const { book, result } = lastApply
    try {
      const r = await withBusy(`Restoring ${result.backup}…`, () => restoreBackup(book.id, result.backup!))
      setLastApply(null)
      setMessage(`${book.title}: restored ${r.restored} (${r.reverted.length} suggestion(s) back to accepted; the previous file is kept as ${r.backup})`)
      await reload()
    } catch (e) {
      setMessage(`${book.title}: ${(e as Error).message}`)
    }
  }

  const openErratum = (e: ErrataReviewEntry) => {
    const id = typeof e.book.id === 'number' ? e.book.id : bookBySlug.get(bookSlug(e.book.title))?.id
    if (!id) { setMessage(`${e.book.title} is not in the library`); return }
    saveProgress(id, e.chapter)
    saveBoardMemory(id, { chapter: e.chapter, gameIndex: e.gameIndex, nodeId: null, annotations: {} })
    navigate(`/read/${id}`)
  }

  const select = 'rounded border border-slate-300 px-1 py-0.5 text-xs'
  return (
    <section aria-label="Suggestions review" className="mt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label>Kind <select aria-label="Kind" className={select} value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value as Filters['kind'] })}>
          <option value="">all</option>{SUGGESTION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select></label>
        <label>Book <select aria-label="Book" className={select} value={filters.book} onChange={(e) => setFilters({ ...filters, book: e.target.value })}>
          <option value="">all</option>{bookOptions.map(([slug, title]) => <option key={slug} value={slug}>{title}</option>)}
        </select></label>
        <label>Status <select aria-label="Status" className={select} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters['status'] })}>
          <option value="">all</option>{SUGGESTION_STATUSES.map((k) => <option key={k} value={k}>{k}</option>)}
        </select></label>
        <label>Origin <select aria-label="Origin" className={select} value={filters.origin} onChange={(e) => setFilters({ ...filters, origin: e.target.value as Filters['origin'] })}>
          <option value="">all</option><option value="server">server</option><option value="resources">resources</option>
        </select></label>
        <button className="underline" onClick={() => void reload()}>Reload</button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <label><input type="checkbox" checked={allSelected} disabled={!shown.length}
          onChange={() => setSelected(allSelected ? new Set() : new Set(shown.map((s) => s.id)))} /> Select all ({shown.length})</label>
        <button className="rounded bg-green-600 px-2 py-0.5 text-white disabled:opacity-50" disabled={!selected.size} onClick={() => void review('accepted')}>Accept</button>
        <button className="rounded bg-red-600 px-2 py-0.5 text-white disabled:opacity-50" disabled={!selected.size} onClick={() => void review('rejected')}>Reject</button>
        {server && isAdmin && applicable.map(({ book, count }) => (
          <button key={book.id} className="rounded bg-blue-600 px-2 py-0.5 text-white" onClick={() => void apply(book)}>
            Apply to EPUB: {book.title} ({count})
          </button>
        ))}
        {lastApply?.result.backup && <button className="underline" onClick={() => void undo()}>Undo (restore {lastApply.result.backup})</button>}
      </div>
      {message && <p role="status" className="mt-2 text-xs text-slate-700">{message}</p>}
      {items === null && <p role="status" className="mt-2 text-xs text-slate-500">Loading suggestions…</p>}
      {items !== null && !shown.length && !shownErrata.length && <p className="mt-2 text-xs text-slate-500">No suggestions match.</p>}

      <ul className="mt-2 flex flex-col gap-2">
        {shown.map((s) => (
          <li key={s.id} aria-label={`Suggestion ${s.id}`} className="rounded border border-slate-200 p-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input type="checkbox" aria-label={`Select ${s.id}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
              <span className="font-semibold">{s.kind}</span>
              <span>{s.target.book}{s.target.chapter != null ? ` · chapter ${s.target.chapter}` : ''}</span>
              <span className="rounded bg-slate-100 px-1">{s.status}</span>
              <span className="text-slate-500">{s.origins.join(' + ')} · {s.author}{s.model ? ` (${s.model})` : ''}</span>
              {s.status === 'accepted' && !server && s.origins.includes('resources') && (
                <button className="underline" onClick={() => void commitStatus(s)}>Commit status to resources</button>
              )}
            </div>
            <div className="mt-1"><BeforeAfter s={s} bookId={bookBySlug.get(bookSlug(s.target.book))?.id} /></div>
          </li>
        ))}
        {shownErrata.map((e) => (
          <li key={`errata-${e.id}`} aria-label={`Erratum ${e.id}`} className="rounded border border-amber-200 bg-amber-50 p-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">move</span>
              <span>{e.book.title} · chapter {e.chapter} · {e.game.label}</span>
              <span className="text-slate-500">{e.origin} · erratum (read-only)</span>
              <button className="underline" onClick={() => openErratum(e)}>Open in the book</button>
            </div>
            <ul className="mt-1 text-xs">
              {e.changes.map((c) => <li key={c.ply}>ply {c.ply}: <del className="text-red-700">{c.from}</del> → <ins className="text-green-700 no-underline">{c.to}</ins> ({c.source})</li>)}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}

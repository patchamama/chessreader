import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lookupPositionComments, type HumanComment } from '../library/commentdb/commentLookup'
import ChessBoard from '../../shared/chess/ChessBoard'
import { loadTraps, type Trap } from '../training/traps'
import { hideComment, type CommentEntry, type CommentSource } from '../comments/commentsApi'
import { entryOf, filterFound, parsePositionInput, replayLine, type FinderFilter, type PgnReading, type PositionMove } from './positionInput'
import { normalizePgn, numberMoves, type PgnLanguageChoice } from './pgnNormalize'
import { COMMON_OPENINGS } from './commonOpenings'
import CommentCard from './CommentCard'
import CommentDetailsModal from './CommentDetailsModal'
import FinderBoard, { type FinderLine } from './FinderBoard'
import FinderHelp from './FinderHelp'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const LANGUAGES: Array<{ value: PgnLanguageChoice; label: string }> = [
  { value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' }, { value: 'de', label: 'Deutsch' },
]

interface Found { fen: string; comments: HumanComment[] }

/** "N comments found for this position" (S9), the cards (editable, S6) and a note when the filters hid some. */
function Results({ found, filter, sources, onEdit, onDelete }: { found: Found; filter?: FinderFilter; sources: CommentSource[]; onEdit: (c: HumanComment, fen: string) => void; onDelete: (c: HumanComment) => Promise<void> }) {
  const shown = useMemo(() => filterFound(found.comments, filter, sources), [found, filter, sources])
  const hidden = found.comments.length - shown.length
  return (
    <div>
      <p role="status" className="font-medium">
        {shown.length} {shown.length === 1 ? 'comment' : 'comments'} found for this position
        {hidden > 0 && <span className="font-normal text-slate-600"> ({hidden} hidden by the filters)</span>}
      </p>
      {shown.length
        ? <ul aria-label="Comments for this position" className="mt-1 flex flex-col gap-2">{shown.map((c, i) => <CommentCard key={`${c.id ?? ''}-${i}`} comment={c} fen={found.fen} onEdit={(x) => onEdit(x, found.fen)} onDelete={onDelete} />)}</ul>
        : <p className="text-slate-600">No comments for this position.</p>}
    </div>
  )
}

/**
 * Find by position (S2, S4, S6-S9): paste a FEN, or a PGN in any notation, pick any of its moves
 * (each can be shown on a board) or play on a board, and see the comments of each position
 * under the filters of the list; every comment can be edited; openings and traps are suggestions to replay.
 */
/** `request`: a position to load (a new `key` loads it again), e.g. from the ranking of the most commented positions. */
export default function PositionFinder({ filter, sources = [], request }: { filter?: FinderFilter; sources?: CommentSource[]; request?: { fen: string; key: number } }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [language, setLanguage] = useState<PgnLanguageChoice>('auto')
  const [error, setError] = useState<string | null>(null)
  const [line, setLine] = useState<FinderLine>({ start: START_FEN, sans: [], ply: 0 })
  // Moves read before the first unrecognised one (only when the text is wrong; the board keeps its line).
  const [partial, setPartial] = useState<PositionMove[] | null>(null)
  const lastWritten = useRef<string | null>(null)
  const [reading, setReading] = useState<PgnReading | null>(null)
  const [shown, setShown] = useState<Found | null>(null)
  const [boards, setBoards] = useState<Set<number>>(new Set())
  const [boardOpen, setBoardOpen] = useState(false)
  const [onBoard, setOnBoard] = useState<Found | null>(null)
  const [editing, setEditing] = useState<CommentEntry | null>(null)
  const [traps, setTraps] = useState<Trap[] | null>(null)
  const [trapQuery, setTrapQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const seq = useRef(0)
  // The comments of each position read for the board (S19, S20), shared by the badges and the map; the filters apply on top.
  const cache = useRef(new Map<string, Promise<HumanComment[]>>())
  const filterRef = useRef({ filter, sources })
  filterRef.current = { filter, sources }
  const filterKey = JSON.stringify([filter, sources.map((x) => x.id)])
  const countFor = useCallback((fen: string): Promise<number> => {
    let p = cache.current.get(fen)
    if (!p) { p = lookupPositionComments(fen); cache.current.set(fen, p); p.catch(() => cache.current.delete(fen)) }
    return p.then((all) => filterFound(all, filterRef.current.filter, filterRef.current.sources).length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  const read = async (fen: string): Promise<Found | null> => {
    const mine = ++seq.current
    try {
      const comments = await lookupPositionComments(fen)
      if (mine !== seq.current) return null
      setError(null)
      return { fen, comments }
    } catch (e) {
      if (mine === seq.current) setError(`The comments could not be read: ${(e as Error).message}`)
      return null
    }
  }
  const show = async (fen: string) => { const f = await read(fen); if (f) setShown(f) }
  const onFen = useCallback((fen: string) => {
    const mine = ++seq.current
    lookupPositionComments(fen).then(
      (comments) => { if (mine === seq.current) { setOnBoard({ fen, comments }); setError(null) } },
      (e: Error) => { if (mine === seq.current) setError(`The comments could not be read: ${e.message}`) })
  }, [])

  const moves = partial ?? replayLine(line.start, line.sans)
  const picked = partial ? null : line.ply > 0 ? line.ply - 1 : null

  /** What the text box says about a line: the moves as numbered PGN, a FEN when it starts elsewhere. */
  const textOf = (l: FinderLine) => (l.sans.length ? (l.start === START_FEN ? numberMoves(l.start, l.sans) : `[FEN "${l.start}"]\n\n${numberMoves(l.start, l.sans)}`) : l.start === START_FEN ? '' : l.start)
  const write = (value: string) => { lastWritten.current = value; setText(value) }

  useEffect(() => {
    if (!request) return
    const l = { start: request.fen, sans: [], ply: 0 }
    setLine(l)
    write(request.fen)
    setPartial(null)
    setError(null)
    setReading(null)
    setShown(null)
    setBoardOpen(true)
    setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.key])

  const find = (input = text, lang = language) => {
    const r = parsePositionInput(input, lang)
    setShown(null)
    setBoards(new Set())
    setReading(null)
    setPartial(null)
    if (r.kind === 'error') { setPartial(r.moves ?? null); setReading(r.reading ?? null); setError(r.message); return }
    setError(null)
    if (r.kind === 'fen') { setLine({ start: r.fen, sans: [], ply: 0 }); void show(r.fen); return }
    setLine({ start: r.start, sans: r.moves.map((m) => m.san as string), ply: r.moves.length })
    setReading(r)
    if (r.text !== input.trim()) write(r.text)
  }
  /** The board changed the line (a move, Reset, Clear, a step): the text follows. */
  const onLine = useCallback((l: FinderLine) => {
    setLine((old) => {
      if (old.start !== l.start || old.sans !== l.sans) { lastWritten.current = textOf(l); setText(lastWritten.current); setError(null); setReading(null); setPartial(null) }
      return l
    })
  }, [])
  // Typing or pasting reads the text after a short pause; what the board itself wrote is not read again.
  useEffect(() => {
    if (!text.trim() || text === lastWritten.current) return
    const t = setTimeout(() => find(text, language), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, language])
  const loadLine = (sans: string[]) => {
    const l = { start: START_FEN, sans, ply: 0 }
    setLine(l)
    write(textOf(l))
    setPartial(null)
    setError(null)
    setReading(null)
    setShown(null)
    setBoards(new Set())
    setBoardOpen(true)
  }
  const loadOpening = (pgn: string) => loadLine(normalizePgn(pgn, { language: 'en' }).moves.map((m) => m.san))
  const loadTrap = (t: Trap) => loadLine(t.sans)
  const changeLanguage = (l: PgnLanguageChoice) => { setLanguage(l); if (text.trim()) find(text, l) }

  const [suggestOpen, setSuggestOpen] = useState(false)
  useEffect(() => {
    if (suggestOpen && !traps) loadTraps().then(setTraps, () => setTraps([]))
  }, [suggestOpen, traps])
  const visibleTraps = (traps ?? []).filter((t) => !trapQuery.trim() || `${t.title} ${t.opening}`.toLocaleLowerCase().includes(trapQuery.trim().toLocaleLowerCase())).slice(0, 12)

  const toggleBoard = (i: number) => setBoards((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const remove = async (c: HumanComment) => {
    if (c.id === undefined) throw new Error('This comment has no id in the database, so it cannot be hidden here.')
    await hideComment(c.id)
    cache.current.clear()
    const without = (f: Found | null) => (f ? { ...f, comments: f.comments.filter((x) => x.id !== c.id) } : f)
    setShown(without)
    setOnBoard(without)
    setNotice('Comment hidden')
  }
  const edit = (c: HumanComment, fen: string) => setEditing(entryOf(c, fen, sources))
  const chip = 'rounded border border-slate-300 px-1.5 py-0.5 text-xs hover:bg-slate-50'

  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="mb-2 rounded border border-slate-200 p-2 text-sm">
      <summary className="cursor-pointer font-medium">Find by position</summary>
      <div className="mt-2 flex flex-col gap-2">
        <textarea aria-label="FEN or PGN" rows={3} className="rounded border border-slate-300 px-2 py-1 font-mono text-xs" placeholder="Paste a FEN or a PGN" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded border border-slate-300 px-2 py-0.5" onClick={() => find()}>Find</button>
          <button className="rounded border border-slate-300 px-2 py-0.5" aria-pressed={boardOpen} onClick={() => setBoardOpen((o) => !o)}>Board</button>
          <label className="flex items-center gap-1 text-xs">
            Notation language
            <select aria-label="Notation language" className="rounded border border-slate-300 px-1 py-0.5" value={language} onChange={(e) => changeLanguage(e.target.value as PgnLanguageChoice)}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
        </div>
        <FinderHelp />
        <details className="rounded border border-slate-200 p-1 text-xs" onToggle={(e) => setSuggestOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer font-medium">Suggestions: common openings and traps</summary>
          <p className="mt-1 text-slate-600">Click one to load its line on the board and replay it to see the comments of each position.</p>
          <ul aria-label="Common openings" className="mt-1 flex flex-wrap gap-1">
            {COMMON_OPENINGS.map((o) => <li key={o.name}><button className={chip} title={o.pgn} onClick={() => loadOpening(o.pgn)}>{o.name}</button></li>)}
          </ul>
          <input type="search" aria-label="Search traps" placeholder="Search traps" className="mt-2 rounded border border-slate-300 px-2 py-0.5" value={trapQuery} onChange={(e) => setTrapQuery(e.target.value)} />
          <ul aria-label="Traps" className="mt-1 flex flex-wrap gap-1">
            {visibleTraps.map((t) => <li key={t.id}><button className={chip} title={numberMoves(START_FEN, t.sans)} onClick={() => loadTrap(t)}>{t.title}</button></li>)}
            {traps && !visibleTraps.length && <li className="text-slate-600">No traps match.</li>}
          </ul>
        </details>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {notice && <p role="status" className="text-green-700">{notice}</p>}
        {reading && reading.text && !error && <p className="text-xs text-slate-600">Read as: <span className="font-mono">{reading.text}</span> ({reading.language.toUpperCase()})</p>}
        {moves.length > 0 && (
          <ul aria-label="Moves" className="flex flex-wrap gap-2">
            {moves.map((m, i) => (
              <li key={i} className="flex flex-col gap-1">
                <span className="flex items-center gap-1">
                  <button className={`rounded border px-1.5 py-0.5 font-mono text-xs ${picked === i ? 'border-violet-700 bg-violet-100' : 'border-slate-300'}`} aria-pressed={picked === i} onClick={() => { if (!partial) setLine((l) => ({ ...l, ply: i + 1 })); if (!boardOpen || partial) void show(m.fen) }}>{m.label}</button>
                  <input type="checkbox" aria-label={`Show ${m.label} on a board`} title="Show on a board" checked={boards.has(i)} onChange={() => toggleBoard(i)} />
                </span>
                {boards.has(i) && <div className="h-28 w-28" data-testid={`move-board-${i}`}><ChessBoard fen={m.fen} orientation="white" hideLabels /></div>}
              </li>
            ))}
          </ul>
        )}
        {shown && (!boardOpen || partial) && <Results found={shown} filter={filter} sources={sources} onEdit={edit} onDelete={remove} />}
        {boardOpen && (
          <section aria-label="Position board" className="flex flex-col gap-2 rounded border border-slate-200 p-2 sm:flex-row">
            <FinderBoard line={line} onLine={onLine} onFen={onFen} count={countFor} />
            <div className="min-w-0 flex-1">{onBoard && <Results found={onBoard} filter={filter} sources={sources} onEdit={edit} onDelete={remove} />}</div>
          </section>
        )}
      </div>
      {editing && <CommentDetailsModal comment={editing} onClose={() => { cache.current.clear(); setEditing(null) }} onHidden={() => { cache.current.clear(); const id = editing.id; const without = (f: Found | null) => (f ? { ...f, comments: f.comments.filter((x) => x.id !== id) } : f); setShown(without); setOnBoard(without); setNotice('Comment hidden') }} />}
    </details>
  )
}


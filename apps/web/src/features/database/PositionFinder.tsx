import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { positionHash } from '@chess-ebook/chess-shared'
import { lookupPositionComments, type HumanComment } from '../library/commentdb/commentLookup'
import ChessBoard from '../../shared/chess/ChessBoard'
import { loadTraps, type Trap } from '../training/traps'
import type { CommentEntry, CommentSource } from '../comments/commentsApi'
import { filterFound, parsePositionInput, type FinderFilter, type PgnReading, type PositionMove } from './positionInput'
import { normalizePgn, type PgnLanguageChoice } from './pgnNormalize'
import { COMMON_OPENINGS } from './commonOpenings'
import CommentCard from './CommentCard'
import CommentDetailsModal from './CommentDetailsModal'
import FinderBoard from './FinderBoard'
import FinderHelp from './FinderHelp'

/** The editor wants a database entry: what the finder knows of the comment, plus its position. */
function entryOf(c: HumanComment, fen: string, sources: CommentSource[]): CommentEntry {
  const source = sources.find((s) => s.title === c.source.title)
  return {
    id: c.id ?? 0, hash: positionHash(fen), fen, text: c.text, lang: c.lang, ply: c.ply, move: Math.ceil(c.ply / 2), san: c.san, gameId: c.gameId, chapter: null,
    source: { id: source?.id ?? 0, title: c.source.title, author: c.source.author, kind: c.source.kind, lang: source?.lang ?? c.lang, book: source?.book ?? null },
    game: { white: null, black: null, label: c.label },
    ...(c.translations ? { translations: c.translations } : {}),
  }
}

const LANGUAGES: Array<{ value: PgnLanguageChoice; label: string }> = [
  { value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' }, { value: 'de', label: 'Deutsch' },
]

interface Found { fen: string; comments: HumanComment[] }

/** "N comments found for this position" (S9), the cards (editable, S6) and a note when the filters hid some. */
function Results({ found, filter, sources, onEdit }: { found: Found; filter?: FinderFilter; sources: CommentSource[]; onEdit: (c: HumanComment, fen: string) => void }) {
  const shown = useMemo(() => filterFound(found.comments, filter, sources), [found, filter, sources])
  const hidden = found.comments.length - shown.length
  return (
    <div>
      <p role="status" className="font-medium">
        {shown.length} {shown.length === 1 ? 'comment' : 'comments'} found for this position
        {hidden > 0 && <span className="font-normal text-slate-600"> ({hidden} hidden by the filters)</span>}
      </p>
      {shown.length
        ? <ul aria-label="Comments for this position" className="mt-1 flex flex-col gap-2">{shown.map((c, i) => <CommentCard key={`${c.id ?? ''}-${i}`} comment={c} fen={found.fen} onEdit={(x) => onEdit(x, found.fen)} />)}</ul>
        : <p className="text-slate-600">No comments for this position.</p>}
    </div>
  )
}

/**
 * Find by position (S2, S4, S6-S9): paste a FEN, or a PGN in any notation, pick any of its moves
 * (each can be shown on a board) or play on a board, and see the comments of each position
 * under the filters of the list; every comment can be edited; openings and traps are suggestions to replay.
 */
export default function PositionFinder({ filter, sources = [] }: { filter?: FinderFilter; sources?: CommentSource[] }) {
  const [text, setText] = useState('')
  const [language, setLanguage] = useState<PgnLanguageChoice>('auto')
  const [error, setError] = useState<string | null>(null)
  const [moves, setMoves] = useState<PositionMove[]>([])
  const [reading, setReading] = useState<PgnReading | null>(null)
  const [shown, setShown] = useState<Found | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [boards, setBoards] = useState<Set<number>>(new Set())
  const [boardOpen, setBoardOpen] = useState(false)
  const [line, setLine] = useState<{ sans: string[] } | null>(null)
  const [onBoard, setOnBoard] = useState<Found | null>(null)
  const [editing, setEditing] = useState<CommentEntry | null>(null)
  const [traps, setTraps] = useState<Trap[] | null>(null)
  const [trapQuery, setTrapQuery] = useState('')
  const seq = useRef(0)

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

  const find = (input = text, lang = language) => {
    const r = parsePositionInput(input, lang)
    setShown(null)
    setPicked(null)
    setBoards(new Set())
    setReading(null)
    if (r.kind === 'error') { setMoves(r.moves ?? []); setReading(r.reading ?? null); setError(r.message); return }
    setError(null)
    if (r.kind === 'fen') { setMoves([]); void show(r.fen); return }
    setMoves(r.moves)
    setReading(r)
    if (r.text !== input.trim()) setText(r.text)
  }
  const loadLine = (sans: string[], pgn: string) => {
    setText(pgn)
    setBoardOpen(true)
    setLine({ sans })
    find(pgn, 'en')
  }
  const loadOpening = (pgn: string) => loadLine(normalizePgn(pgn, { language: 'en' }).moves.map((m) => m.san), pgn)
  const loadTrap = (t: Trap) => loadLine(t.sans, t.sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' '))
  const changeLanguage = (l: PgnLanguageChoice) => { setLanguage(l); if (text.trim()) find(text, l) }

  const [suggestOpen, setSuggestOpen] = useState(false)
  useEffect(() => {
    if (suggestOpen && !traps) loadTraps().then(setTraps, () => setTraps([]))
  }, [suggestOpen, traps])
  const visibleTraps = (traps ?? []).filter((t) => !trapQuery.trim() || `${t.title} ${t.opening}`.toLocaleLowerCase().includes(trapQuery.trim().toLocaleLowerCase())).slice(0, 12)

  const toggleBoard = (i: number) => setBoards((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const edit = (c: HumanComment, fen: string) => setEditing(entryOf(c, fen, sources))
  const chip = 'rounded border border-slate-300 px-1.5 py-0.5 text-xs hover:bg-slate-50'

  return (
    <details className="mb-2 rounded border border-slate-200 p-2 text-sm">
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
            {visibleTraps.map((t) => <li key={t.id}><button className={chip} title={t.sans.join(' ')} onClick={() => loadTrap(t)}>{t.title}</button></li>)}
            {traps && !visibleTraps.length && <li className="text-slate-600">No traps match.</li>}
          </ul>
        </details>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {reading && reading.text && !error && <p className="text-xs text-slate-600">Read as: <span className="font-mono">{reading.text}</span> ({reading.language.toUpperCase()})</p>}
        {moves.length > 0 && (
          <ul aria-label="Moves" className="flex flex-wrap gap-2">
            {moves.map((m, i) => (
              <li key={i} className="flex flex-col gap-1">
                <span className="flex items-center gap-1">
                  <button className={`rounded border px-1.5 py-0.5 font-mono text-xs ${picked === i ? 'border-violet-700 bg-violet-100' : 'border-slate-300'}`} aria-pressed={picked === i} onClick={() => { setPicked(i); void show(m.fen) }}>{m.label}</button>
                  <input type="checkbox" aria-label={`Show ${m.label} on a board`} title="Show on a board" checked={boards.has(i)} onChange={() => toggleBoard(i)} />
                </span>
                {boards.has(i) && <div className="h-28 w-28" data-testid={`move-board-${i}`}><ChessBoard fen={m.fen} orientation="white" hideLabels /></div>}
              </li>
            ))}
          </ul>
        )}
        {shown && <Results found={shown} filter={filter} sources={sources} onEdit={edit} />}
        {boardOpen && (
          <section aria-label="Position board" className="flex flex-col gap-2 rounded border border-slate-200 p-2 sm:flex-row">
            <FinderBoard line={line} onFen={onFen} />
            <div className="min-w-0 flex-1">{onBoard && <Results found={onBoard} filter={filter} sources={sources} onEdit={edit} />}</div>
          </section>
        )}
      </div>
      {editing && <CommentDetailsModal comment={editing} onClose={() => setEditing(null)} />}
    </details>
  )
}


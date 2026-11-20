import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../shared/externalBook/externalBookStore'
import { saveProgress } from '../library/store/readingStore'
import { pgnToChapters } from '../gamesearch/pgnChapters'
import { usePageWidth } from '../../shared/layout/pageWidth'
import { withBusy } from '../../shared/layout/busyStore'
import {
  firstMoves, gamesPerDecade, hasResources, loadBookGames, loadBooks, loadGames, loadRatings, matchesStat, openings, surname, topPlayers, wikipediaSummary,
  type DbBook, type DbGame, type DbGameFull, type PlayerRating, type StatFilter,
} from './resources'
import { gameFacts } from './gameFacts'
import { openGameInBook } from './openInBook'
import { gameName, withGameReference } from './gameReference'
import { markVisited, useVisitedCheck } from '../../shared/visited/visitedStore'
import { VisitedMark } from '../../shared/visited/VisitedMark'
import CommentsTab from './CommentsTab'

type Tab = 'books' | 'search' | 'openings' | 'players' | 'stats' | 'comments'

/** Horizontal bars, drawn by hand (no chart library). */
export function BarChart({ data, label }: { data: { label: string; value: number; note?: string }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <figure aria-label={label} className="text-xs">
      <figcaption className="mb-1 font-semibold text-slate-700">{label}</figcaption>
      <svg role="img" aria-label={label} width="100%" height={data.length * 20} viewBox={`0 0 400 ${data.length * 20}`} preserveAspectRatio="none">
        {data.map((d, i) => (
          <g key={d.label} transform={`translate(0 ${i * 20})`}>
            <text x="0" y="13" fontSize="11" fill="#334155">{d.label}</text>
            <rect x="110" y="3" height="13" width={(250 * d.value) / max} rx="2" fill="#2563eb" />
            <text x={115 + (250 * d.value) / max} y="13" fontSize="11" fill="#334155">{d.value}{d.note ? ` · ${d.note}` : ''}</text>
          </g>
        ))}
      </svg>
    </figure>
  )
}

const PIE_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569']

/** A pie ("slices") chart, drawn by hand like BarChart; past nine slices the rest are one "Other" slice. */
export function PieChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const shown = data.length > 10 ? [...data.slice(0, 9), { label: 'Other', value: data.slice(9).reduce((n, d) => n + d.value, 0) }] : data
  const total = shown.reduce((n, d) => n + d.value, 0) || 1
  const point = (a: number) => `${(60 + 55 * Math.sin(a)).toFixed(2)} ${(60 - 55 * Math.cos(a)).toFixed(2)}`
  let angle = 0
  return (
    <figure className="text-xs">
      <figcaption className="mb-1 font-semibold text-slate-700">{label}</figcaption>
      <svg role="img" aria-label={`${label} (pie chart)`} width="100%" height={Math.max(130, shown.length * 16 + 10)} viewBox={`0 0 400 ${Math.max(130, shown.length * 16 + 10)}`}>
        {shown.map((d, i) => {
          const from = angle
          angle += (2 * Math.PI * d.value) / total
          const fill = PIE_COLORS[i % PIE_COLORS.length]
          return d.value >= total
            ? <circle key={d.label} cx="60" cy="60" r="55" fill={fill} />
            : <path key={d.label} d={`M60 60 L${point(from)} A55 55 0 ${angle - from > Math.PI ? 1 : 0} 1 ${point(angle)} Z`} fill={fill} stroke="#fff" strokeWidth="1" />
        })}
        {shown.map((d, i) => (
          <g key={`l-${d.label}`} transform={`translate(135 ${i * 16 + 4})`}>
            <rect width="10" height="10" fill={PIE_COLORS[i % PIE_COLORS.length]} />
            <text x="15" y="9" fontSize="11" fill="#334155">{d.label} · {d.value} ({Math.round((100 * d.value) / total)}%)</text>
          </g>
        ))}
      </svg>
    </figure>
  )
}

type ChartKind = 'none' | 'bar' | 'pie'
const chartKey = (id: string) => `chessreader.database.chart.${id}`
function readChart(id: string): ChartKind {
  try {
    const v = localStorage.getItem(chartKey(id))
    return v === 'bar' || v === 'pie' ? v : 'none'
  } catch { return 'none' }
}

interface StatRow { key: string; label: string; filter: StatFilter | null; value: number; cells: (string | number)[]; note?: string }

/**
 * A statistics table whose items link to their games, with an optional bar or
 * pie chart of the same rows above it (off by default, remembered per table).
 */
function StatTable({ id, title, head, rows, onPick }: { id: string; title: string; head: string[]; rows: StatRow[]; onPick: (f: StatFilter) => void }) {
  const [chart, setChart] = useState<ChartKind>(() => readChart(id))
  const pick = (v: ChartKind) => {
    setChart(v)
    try { localStorage.setItem(chartKey(id), v) } catch { /* not remembered */ }
  }
  const data = rows.map((r) => ({ label: r.label.slice(0, 18), value: r.value, ...(r.note ? { note: r.note } : {}) }))
  return (
    <section className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <select aria-label={`Chart for ${title}`} className="rounded border border-slate-300 px-1 text-xs" value={chart} onChange={(e) => pick(e.target.value as ChartKind)}>
          <option value="none">No chart</option>
          <option value="bar">Bar chart</option>
          <option value="pie">Pie chart</option>
        </select>
      </div>
      {chart === 'bar' && <BarChart label={title} data={data} />}
      {chart === 'pie' && <PieChart label={title} data={data} />}
      <table aria-label={title} className="mt-1 w-full text-xs">
        <thead><tr className="text-left text-slate-500">{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              <td>{r.filter
                ? <button className="text-left text-blue-700 underline" aria-label={statLinkName(r.filter)} onClick={() => onPick(r.filter!)}>{r.label}</button>
                : r.label}</td>
              {r.cells.map((c, i) => <td key={i}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

const statLinkName = (f: StatFilter) =>
  f.kind === 'player' ? `Games of ${f.value}` : f.kind === 'decade' ? `Games of the ${f.value}` : f.kind === 'first' ? `Games of the first move ${f.value}` : `Games of the opening ${f.value}`
const STAT_KIND: Record<StatFilter['kind'], string> = { player: 'Player', decade: 'Decade', first: 'First move', opening: 'Opening' }

type SortKey = 'rank' | 'player' | 'games' | 'accuracy' | 'engineAgreement' | 'maiaAgreement' | 'nearPerfect'
const SORT_COLUMNS: [SortKey, string][] = [['rank', '#'], ['player', 'Player'], ['games', 'Games'], ['accuracy', 'Accuracy'], ['engineAgreement', '= Stockfish'], ['maiaAgreement', '= Maia'], ['nearPerfect', 'Near-perfect']]
const sortValue = (r: PlayerRating & { rank: number }, k: SortKey): string | number | null =>
  k === 'nearPerfect' ? r.nearPerfect.length : k === 'player' ? r.player.toLowerCase() : r[k]

/**
 * The game database of the books (private resources): books as cards with
 * cover, games, most frequent players and period; search by player, opening
 * and year; openings; players ranked by the engines with their near-perfect
 * games and a Wikipedia summary; statistics as tables whose items link to
 * their games, each with an optional bar or pie chart.
 */
export default function DatabasePage() {
  const lang = useSettingsStore((s) => s.language)
  const width = usePageWidth('max-w-6xl')
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('books')
  const [books, setBooks] = useState<DbBook[] | null>(null)
  const [games, setGames] = useState<DbGame[]>([])
  const [ratings, setRatings] = useState<PlayerRating[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [book, setBook] = useState<{ book: DbBook; games: DbGameFull[] } | null>(null)
  const [q, setQ] = useState({ player: '', opening: '', from: '', to: '' })
  const [opening, setOpening] = useState<string | null>(null)
  const [player, setPlayer] = useState<PlayerRating | null>(null)
  const [wiki, setWiki] = useState<{ extract: string; url: string; thumbnail?: string } | null>(null)
  const [top, setTop] = useState(5)
  const [statFilter, setStatFilter] = useState<StatFilter | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'rank', dir: 'asc' })
  const available = hasResources()
  const visited = useVisitedCheck()
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    if (!available) return
    loadBooks().then(setBooks, (e: Error) => setError(e.message))
    loadGames().then(setGames, () => setGames([]))
    loadRatings().then((r) => setRatings(r.players), () => setRatings([]))
  }, [available])

  /** A game: the one with the book's remarks (the moves only in databases built before them). */
  const open = (g: { id: string; book?: string }, bookId?: string) => withBusy('Opening the commented game', async () => {
    const list = book && book.book.id === (bookId ?? g.book) ? book.games : await loadBookGames(bookId ?? g.book!)
    const full = list.find((x) => x.id === g.id)
    if (!full) return
    const from = bookId ?? g.book
    const lichess = full.source === 'lichess' || from === 'lichess'
    const source = lichess || !from ? null : (booksById.get(from) ?? (await loadBooks().catch(() => [] as DbBook[])).find((b) => b.id === from) ?? null)
    const tags: [string, string | number | null | undefined][] = [['Event', full.event], ['Site', full.place], ['Date', full.date?.replace(/-/g, '.')], ['White', full.white ?? '?'], ['Black', full.black ?? '?'],
      ['Result', full.result], ['WhiteElo', full.whiteElo], ['BlackElo', full.blackElo], ['Termination', full.termination],
      // A fragment of the book starts from a position.
      ...(full.fen ? [['SetUp', '1'], ['FEN', full.fen]] as [string, string][] : [])]
    const pgn = `${tags.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n')}\n\n${full.commented || full.pgn}`
    const { chapters } = pgnToChapters(pgn, { fromPosition: true })
    if (!chapters.length) return
    // Headed by the game, its book and its database id (S6); its source at the end (S8).
    chapters[0] = withGameReference(chapters[0], full, { book: source, lichess, ...(from ? { bookId: from } : {}) })
    saveProgress(EXTERNAL_BOOK_ID, 1)
    useExternalBookStore.getState().open(gameName(full), chapters)
    markVisited('game', g.id)
    navigate(`/read/${EXTERNAL_BOOK_ID}`)
  })

  const booksById = useMemo(() => new Map((books ?? []).map((b) => [b.id, b])), [books])
  /** A book's card opened on its games. */
  const showBook = (b: DbBook) => {
    setTab('books')
    void loadBookGames(b.id).then((g) => setBook({ book: b, games: g }), (e: Error) => setError(e.message))
  }
  /** The book of a game, opened at that game (its chapter and its place among the chapter's games). */
  const openInBook = (b: DbBook, chapter: number, gameIndex: number | null) => withBusy('Opening the book', async () => {
    markVisited('repoBook', b.id)
    try {
      navigate(await openGameInBook(b, { chapter, gameIndex }))
    } catch (e) {
      setError(`${b.title}: ${(e as Error).message}`)
    }
  })

  // "Open this game in the book" at the end of an opened game (S8): the reader's
  // text links here; while this page is kept mounted the click opens the book at once.
  const openLinked = useRef(openInBook)
  openLinked.current = openInBook
  const linkedBook = async (id: string) => booksById.get(id) ?? (await loadBooks()).find((b) => b.id === id)
  const linkedRef = useRef(linkedBook)
  linkedRef.current = linkedBook
  useEffect(() => {
    if (!available) return
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest?.('a.open-game-in-book') as HTMLElement | null
      if (!link?.dataset.book || !link.dataset.chapter) return
      e.preventDefault()
      const { book: id, chapter, game } = link.dataset
      void linkedRef.current(id).then((b) => b && openLinked.current(b, Number(chapter), game ? Number(game) : null))
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [available])
  // The same link after a refresh of the reader: the database route opens the book.
  const linkedParam = params.get('openBook')
  useEffect(() => {
    if (!available || !linkedParam) return
    const chapter = Number(params.get('chapter'))
    const game = params.get('game')
    setParams({}, { replace: true })
    if (!chapter) return
    void linkedRef.current(linkedParam).then((b) => b && openLinked.current(b, chapter, game ? Number(game) : null), (e: Error) => setError(e.message))
  }, [available, linkedParam, params, setParams])

  const found = useMemo(() => games.filter((g) =>
    (!statFilter || matchesStat(g, statFilter))
    && (!q.player || [g.white, g.black].some((p) => p?.toLowerCase().includes(q.player.toLowerCase())))
    && (!q.opening || g.opening.toLowerCase().includes(q.opening.toLowerCase()))
    && (!q.from || (g.year ?? 0) >= Number(q.from)) && (!q.to || (g.year ?? 9999) <= Number(q.to))), [games, q, statFilter])

  const ranked = useMemo(() => {
    const list = (ratings ?? []).filter((r) => r.games >= 5).map((r, i) => ({ ...r, rank: i + 1 }))
    const sign = sort.dir === 'asc' ? 1 : -1
    // Unknown values (no Maia agreement) always go last.
    return list.sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key)
      if (x === null || y === null) return x === y ? a.rank - b.rank : x === null ? 1 : -1
      return (x < y ? -1 : x > y ? 1 : a.rank - b.rank) * sign
    })
  }, [ratings, sort])
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key
    ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'rank' || key === 'player' ? 'asc' : 'desc' }))

  /** A statistics item: its games, in the search results. */
  const showStat = (f: StatFilter) => {
    setStatFilter(f)
    setQ({ player: '', opening: '', from: '', to: '' })
    setTab('search')
  }
  const byId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])

  useEffect(() => {
    setWiki(null)
    if (player) void wikipediaSummary(player.names.sort((a, b) => b.length - a.length)[0], lang).then(setWiki)
  }, [player, lang])

  const row = 'flex items-center justify-between gap-2 rounded border border-slate-100 bg-white px-2 py-1 text-xs'
  /** Where a game comes from: its book (opening the book at that game, or the book's games) or Lichess. */
  const sourceOf = (from: string | undefined, lichess: boolean, at?: { chapter?: number | null; gameIndex?: number | null }) => {
    if (lichess) return <span className="text-slate-500">Lichess</span>
    const source = from ? booksById.get(from) : undefined
    return source
      ? <button className="text-blue-700 underline" aria-label={`Book: ${source.title}`} onClick={() => (at?.chapter ? void openInBook(source, at.chapter, at.gameIndex ?? null) : showBook(source))}>{source.title}</button>
      : <span className="text-slate-500">{from ?? '—'}</span>
  }
  const gameRow = (g: DbGame | DbGameFull, bookId?: string) => {
    const from = bookId ?? ('book' in g ? g.book : undefined)
    const lichess = g.source === 'lichess' || from === 'lichess'
    const source = lichess || !from ? null : booksById.get(from) ?? null
    const players = `${g.white} – ${g.black}`
    const seen = visited('game', g.id)
    return (
      <li key={g.id} className={`${row} ${seen ? 'border-violet-200 bg-violet-50 text-violet-900' : ''}`} {...(seen ? { 'data-visited': '' } : {})}>
        <span className="flex items-start gap-1">
          {seen && <VisitedMark />}
          <span>
          <strong>{g.white ?? '?'} – {g.black ?? '?'}</strong> · {g.year ?? '—'} · {g.opening || '—'}{gameFacts(g).map((f) => ` · ${f}`).join('')}
          {' · '}{sourceOf(from, lichess, g)}
          </span>
        </span>
        <span className="flex shrink-0 gap-1">
          <button className="rounded border border-slate-300 px-2 py-0.5" aria-label={`Open ${players}`} onClick={() => void open(g, bookId)}>Open</button>
          {source && g.chapter && (
            <button className="rounded border border-slate-300 px-2 py-0.5" aria-label={`Open ${players} in the book`} onClick={() => void openInBook(source, g.chapter!, g.gameIndex ?? null)}>Open in the book</button>
          )}
        </span>
      </li>
    )
  }

  if (!available) {
    return (
      <div className={`mx-auto ${width} px-4 py-6`}>
        <h1 className="text-xl font-bold text-slate-800">Database</h1>
        <p className="mt-2 text-sm text-slate-600">The game database of the books is private. With the server it is read from <code>storage/resources</code>; in the demo, set the URL and token of the private repository <code>chessreader-resources</code> in Settings → Commentary database.</p>
      </div>
    )
  }

  const tabs: [Tab, string][] = [['books', 'Books'], ['search', 'Search'], ['openings', 'Openings'], ['players', 'Players'], ['stats', 'Statistics'], ['comments', 'Comments']]
  return (
    <div className={`mx-auto ${width} px-4 py-6`}>
      <h1 className="text-xl font-bold text-slate-800">Database</h1>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <div role="tablist" className="mt-3 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-t border px-3 py-1.5 text-sm ${tab === id ? 'border-slate-200 border-b-white bg-white font-semibold' : 'border-transparent text-slate-600'}`}>{label}</button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'books' && !book && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Books">
            {(books ?? []).map((b) => (
              <li key={b.id} className={`relative flex gap-3 rounded-lg border p-3 ${visited('repoBook', b.id) ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'}`} {...(visited('repoBook', b.id) ? { 'data-visited': '' } : {})}>
                {visited('repoBook', b.id) && <span className="absolute right-2 top-2"><VisitedMark /></span>}
                {b.thumb ? <img src={b.thumb} alt="" className="h-32 w-24 shrink-0 rounded bg-slate-100 object-contain shadow" /> : <div className="h-32 w-24 shrink-0 rounded bg-slate-200" />}
                <div className="min-w-0 text-sm">
                  <p className="font-semibold leading-tight">{b.title}</p>
                  <p className="text-xs text-slate-600">{b.author}</p>
                  <p className="mt-1 text-xs">{b.games} games{b.period ? ` · mostly ${b.period[0]}–${b.period[1]}` : ''}</p>
                  {b.topPlayers.length > 0 && <p className="text-xs text-slate-500">{b.topPlayers.slice(0, 4).map((p) => `${p.name} (${p.games})`).join(', ')}</p>}
                  <button className="mt-2 rounded bg-blue-600 px-2 py-0.5 text-xs text-white" aria-label={`Games of ${b.title}`}
                    onClick={() => void loadBookGames(b.id).then((g) => setBook({ book: b, games: g }))}>Games</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {tab === 'books' && book && (
          <div>
            <button className="text-sm text-blue-700 underline" onClick={() => setBook(null)}>← Books</button>
            <h2 className="mt-2 font-semibold">{book.book.title} — {book.games.length} games</h2>
            <ul className="mt-2 flex flex-col gap-1">{book.games.map((g) => gameRow(g, book.book.id))}</ul>
          </div>
        )}
        {tab === 'search' && (
          <div>
            <div className="flex flex-wrap gap-2 text-sm">
              <input aria-label="Player" placeholder="Player" className="rounded border border-slate-300 px-2 py-1" value={q.player} onChange={(e) => setQ({ ...q, player: e.target.value })} />
              <input aria-label="Opening" placeholder="Opening" className="rounded border border-slate-300 px-2 py-1" value={q.opening} onChange={(e) => setQ({ ...q, opening: e.target.value })} />
              <input aria-label="From year" placeholder="From" className="w-20 rounded border border-slate-300 px-2 py-1" value={q.from} onChange={(e) => setQ({ ...q, from: e.target.value })} />
              <input aria-label="To year" placeholder="To" className="w-20 rounded border border-slate-300 px-2 py-1" value={q.to} onChange={(e) => setQ({ ...q, to: e.target.value })} />
              <span className="self-center text-xs text-slate-500">{found.length} games</span>
            </div>
            {statFilter && (
              <p className="mt-2 flex items-center gap-2 text-xs">
                <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-800">{STAT_KIND[statFilter.kind]}: {statFilter.label}</span>
                <button className="text-blue-700 underline" onClick={() => setStatFilter(null)}>Clear filter</button>
              </p>
            )}
            <ul className="mt-2 flex flex-col gap-1">{found.slice(0, 200).map((g) => gameRow(g))}</ul>
          </div>
        )}
        {tab === 'openings' && (
          opening ? (
            <div>
              <button className="text-sm text-blue-700 underline" onClick={() => setOpening(null)}>← Openings</button>
              <ul className="mt-2 flex flex-col gap-1">{games.filter((g) => (g.opening || 'Unknown') === opening).map((g) => gameRow(g))}</ul>
            </div>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {openings(games).map((o) => (
                <li key={o.name} className={row}><span>{o.name}</span><button className="underline" onClick={() => setOpening(o.name)}>{o.games} games</button></li>
              ))}
            </ul>
          )
        )}
        {tab === 'players' && (
          <div className="flex flex-col gap-3 md:flex-row">
            <table className="w-full max-w-xl text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  {SORT_COLUMNS.map(([key, label]) => (
                    <th key={key} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button className="hover:text-slate-800" onClick={() => sortBy(key)}>
                        {label}<span aria-hidden="true" className="ml-0.5">{sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.player} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setPlayer(r)}>
                    <td>{r.rank}</td><td className="font-semibold">{r.player}</td><td>{r.games}</td><td>{r.accuracy}%</td><td>{r.engineAgreement}%</td><td>{r.maiaAgreement ?? '—'}{r.maiaAgreement !== null ? '%' : ''}</td><td>{r.nearPerfect.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ratings && ratings.length === 0 && <p className="text-xs text-slate-500">No engine ratings yet (scripts/rate-players.mjs).</p>}
            {player && (
              <aside className="flex-1 rounded border border-slate-200 bg-white p-3 text-sm">
                <h2 className="font-semibold">{player.names.join(' / ')}</h2>
                {wiki && <p className="mt-1 text-xs text-slate-700">{wiki.thumbnail && <img src={wiki.thumbnail} alt="" className="float-right ml-2 h-20 rounded" />}{wiki.extract} <a className="text-blue-700 underline" href={wiki.url} target="_blank" rel="noreferrer">Wikipedia</a></p>}
                <p className="mt-2 text-xs">Accuracy {player.accuracy}% · Stockfish's move {player.engineAgreement}% · Maia's move {player.maiaAgreement ?? '—'}%</p>
                <h3 className="mt-2 text-xs font-semibold">Near-perfect games (accuracy ≥ 95)</h3>
                <ul className="mt-1 flex flex-col gap-1">
                  {player.nearPerfect.slice(0, 20).map((g) => (
                    <li key={g.game + g.color} className={row}><span>{`${g.white} – ${g.black} · ${g.year ?? '—'} · ${g.accuracy}%`}{(byId.has(g.game) ? gameFacts(byId.get(g.game)!) : []).map((f) => ` · ${f}`).join('')}{' · '}{sourceOf(g.book, byId.get(g.game)?.source === 'lichess' || g.book === 'lichess', byId.get(g.game))}</span>
                      <button className="rounded border border-slate-300 px-2 py-0.5" onClick={() => void open({ id: g.game, book: g.book })}>Open</button></li>
                  ))}
                </ul>
                <h3 className="mt-2 text-xs font-semibold">Games</h3>
                <ul className="mt-1 flex flex-col gap-1">{games.filter((g) => [g.white, g.black].some((p) => p && surname(p) === player.player)).slice(0, 40).map((g) => gameRow(g))}</ul>
              </aside>
            )}
          </div>
        )}
        {tab === 'comments' && <CommentsTab books={books ?? []} />}
        {tab === 'stats' && (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs">Players shown
                <select aria-label="Players shown" className="rounded border border-slate-300 px-1" value={top} onChange={(e) => setTop(Number(e.target.value))}>
                  {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <StatTable id="players" title="Players with most games" head={['Player', 'Games', 'White / Black', 'Score']} onPick={showStat}
                rows={topPlayers(games, top).map((p) => ({ key: p.name, label: p.name, filter: { kind: 'player', value: p.name, label: p.name }, value: p.games, cells: [p.games, `${p.white} / ${p.black}`, p.score >= 0 ? `${p.score}%` : '—'], note: `${p.white}W/${p.black}B${p.score >= 0 ? ` · ${p.score}%` : ''}` }))} />
            </div>
            <StatTable id="decades" title="Games per decade" head={['Decade', 'Games']} onPick={showStat}
              rows={gamesPerDecade(games).map((d) => ({ key: d.label, label: d.label, filter: { kind: 'decade', value: d.label, label: d.label }, value: d.value, cells: [d.value] }))} />
            <StatTable id="first-moves" title="First moves (White's score)" head={['Move', 'Games', "White's score"]} onPick={showStat}
              rows={firstMoves(games).slice(0, 8).map((m) => ({ key: m.move, label: m.move, filter: { kind: 'first', value: m.move, label: m.move }, value: m.games, cells: [m.games, m.whiteScore >= 0 ? `${m.whiteScore}%` : '—'], note: m.whiteScore >= 0 ? `${m.whiteScore}%` : '' }))} />
            <StatTable id="openings" title="Openings" head={['Opening', 'Games']} onPick={showStat}
              rows={openings(games).slice(0, 10).map((o) => ({ key: o.name, label: o.name, filter: { kind: 'opening', value: o.name, label: o.name }, value: o.games, cells: [o.games] }))} />
          </div>
        )}
      </div>
    </div>
  )
}

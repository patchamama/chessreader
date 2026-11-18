import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../shared/externalBook/externalBookStore'
import { saveProgress } from '../library/store/readingStore'
import { pgnToChapters } from '../gamesearch/pgnChapters'
import { usePageWidth } from '../../shared/layout/pageWidth'
import {
  firstMoves, gamesPerDecade, hasResources, loadBookGames, loadBooks, loadGames, loadRatings, openings, surname, topPlayers, wikipediaSummary,
  type DbBook, type DbGame, type DbGameFull, type PlayerRating,
} from './resources'

type Tab = 'books' | 'search' | 'openings' | 'players' | 'stats'

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

/**
 * The game database of the books (private resources): books as cards with
 * cover, games, most frequent players and period; search by player, opening
 * and year; openings; players ranked by the engines with their near-perfect
 * games and a Wikipedia summary; statistics with charts and tables.
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
  const available = hasResources()

  useEffect(() => {
    if (!available) return
    loadBooks().then(setBooks, (e: Error) => setError(e.message))
    loadGames().then(setGames, () => setGames([]))
    loadRatings().then((r) => setRatings(r.players), () => setRatings([]))
  }, [available])

  const open = async (g: { id: string; book?: string }, bookId?: string) => {
    const list = book && book.book.id === (bookId ?? g.book) ? book.games : await loadBookGames(bookId ?? g.book!)
    const full = list.find((x) => x.id === g.id)
    if (!full) return
    const title = `${full.white ?? '?'} – ${full.black ?? '?'}${full.year ? ` (${full.year})` : ''}`
    const pgn = `[White "${full.white ?? '?'}"]\n[Black "${full.black ?? '?'}"]\n[Result "${full.result}"]\n\n${full.pgn}`
    const { chapters } = pgnToChapters(pgn)
    if (!chapters.length) return
    saveProgress(EXTERNAL_BOOK_ID, 1)
    useExternalBookStore.getState().open(title, chapters)
    navigate(`/read/${EXTERNAL_BOOK_ID}`)
  }

  const found = useMemo(() => games.filter((g) =>
    (!q.player || [g.white, g.black].some((p) => p?.toLowerCase().includes(q.player.toLowerCase())))
    && (!q.opening || g.opening.toLowerCase().includes(q.opening.toLowerCase()))
    && (!q.from || (g.year ?? 0) >= Number(q.from)) && (!q.to || (g.year ?? 9999) <= Number(q.to))), [games, q])

  useEffect(() => {
    setWiki(null)
    if (player) void wikipediaSummary(player.names.sort((a, b) => b.length - a.length)[0], lang).then(setWiki)
  }, [player, lang])

  const row = 'flex items-center justify-between gap-2 rounded border border-slate-100 bg-white px-2 py-1 text-xs'
  const gameRow = (g: DbGame | DbGameFull, bookId?: string) => (
    <li key={g.id} className={row}>
      <span><strong>{g.white ?? '?'} – {g.black ?? '?'}</strong> · {g.year ?? '—'} · {g.opening || '—'} · {g.result} · {g.moves} moves</span>
      <button className="rounded border border-slate-300 px-2 py-0.5" aria-label={`Open ${g.white} – ${g.black}`} onClick={() => void open(g, bookId)}>Open</button>
    </li>
  )

  if (!available) {
    return (
      <div className={`mx-auto ${width} px-4 py-6`}>
        <h1 className="text-xl font-bold text-slate-800">Database</h1>
        <p className="mt-2 text-sm text-slate-600">The game database of the books is private. With the server it is read from <code>storage/resources</code>; in the demo, set the URL and token of the private repository <code>chessreader-resources</code> in Settings → Commentary database.</p>
      </div>
    )
  }

  const tabs: [Tab, string][] = [['books', 'Books'], ['search', 'Search'], ['openings', 'Openings'], ['players', 'Players'], ['stats', 'Statistics']]
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
              <li key={b.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
                {b.thumb ? <img src={b.thumb} alt="" className="h-32 w-24 shrink-0 rounded object-cover shadow" /> : <div className="h-32 w-24 shrink-0 rounded bg-slate-200" />}
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
              <thead><tr className="text-left text-slate-500"><th>#</th><th>Player</th><th>Games</th><th>Accuracy</th><th>= Stockfish</th><th>= Maia</th><th>Near-perfect</th></tr></thead>
              <tbody>
                {(ratings ?? []).filter((r) => r.games >= 5).map((r, i) => (
                  <tr key={r.player} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setPlayer(r)}>
                    <td>{i + 1}</td><td className="font-semibold">{r.player}</td><td>{r.games}</td><td>{r.accuracy}%</td><td>{r.engineAgreement}%</td><td>{r.maiaAgreement ?? '—'}{r.maiaAgreement !== null ? '%' : ''}</td><td>{r.nearPerfect.length}</td>
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
                    <li key={g.game + g.color} className={row}><span>{g.white} – {g.black} · {g.year ?? '—'} · {g.accuracy}%</span>
                      <button className="rounded border border-slate-300 px-2 py-0.5" onClick={() => void open({ id: g.game, book: g.book })}>Open</button></li>
                  ))}
                </ul>
                <h3 className="mt-2 text-xs font-semibold">Games</h3>
                <ul className="mt-1 flex flex-col gap-1">{games.filter((g) => [g.white, g.black].some((p) => p && surname(p) === player.player)).slice(0, 40).map((g) => gameRow(g))}</ul>
              </aside>
            )}
          </div>
        )}
        {tab === 'stats' && (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs">Players shown
                <select aria-label="Players shown" className="rounded border border-slate-300 px-1" value={top} onChange={(e) => setTop(Number(e.target.value))}>
                  {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <BarChart label="Players with most games" data={topPlayers(games, top).map((p) => ({ label: p.name, value: p.games, note: `${p.white}W/${p.black}B${p.score >= 0 ? ` · ${p.score}%` : ''}` }))} />
            </div>
            <BarChart label="Games per decade" data={gamesPerDecade(games)} />
            <BarChart label="First moves (White's score)" data={firstMoves(games).slice(0, 8).map((m) => ({ label: m.move, value: m.games, note: m.whiteScore >= 0 ? `${m.whiteScore}%` : '' }))} />
            <BarChart label="Openings" data={openings(games).slice(0, 10).map((o) => ({ label: o.name.slice(0, 18), value: o.games }))} />
          </div>
        )}
      </div>
    </div>
  )
}

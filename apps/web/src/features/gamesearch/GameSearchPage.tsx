import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  OPENINGS,
  chessComArchives,
  chessComGames,
  lichessBroadcasts,
  lichessBroadcastPgn,
  lichessMasterPgn,
  lichessMastersByOpening,
  lichessStudiesBy,
  lichessStudyPgn,
  lichessStudyUrl,
  lichessMasterUrl,
  studyIdFrom,
  cachedLichessEntries,
  LichessAuthError,
  LICHESS_TOKEN_URL,
  type BroadcastSummary,
  type ChessComGame,
  type MasterGame,
  type StudySummary,
} from './sources'
import { RECOMMENDED_GAMES, STUDY_TOPICS, lichessStudySearchUrl, openingsFor } from './recommended'
import { pgnToChapters } from './pgnChapters'
import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../shared/externalBook/externalBookStore'
import { saveProgress } from '../library/store/readingStore'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { PuzzlePanel } from './PuzzlePanel'
import { MyGamesBrowser } from './MyGamesBrowser'
import { usePageWidth } from '../../shared/layout/pageWidth'

type Tab = 'recommended' | 'studies' | 'masters' | 'broadcasts' | 'chesscom' | 'mine' | 'puzzles'

const TABS: { id: Tab; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'studies', label: 'Annotated studies' },
  { id: 'masters', label: 'Master games by opening' },
  { id: 'broadcasts', label: 'Tournaments' },
  { id: 'chesscom', label: 'Chess.com player' },
  { id: 'mine', label: 'My games (Lichess, chess.com)' },
  { id: 'puzzles', label: 'Lichess puzzles' },
]

/** Topic filters over study titles (Lichess has no topic search API). */
const TOPICS: { label: string; pattern: RegExp }[] = [
  { label: 'Annotated games', pattern: /annotat|comment|analys|explained|instructive/i },
  { label: 'Openings', pattern: /opening|repertoire|gambit|defen[cs]e|sicilian|indian|ruy|italian/i },
  { label: 'Tactics', pattern: /tactic|puzzle|combination|mate in|checkmate|trap/i },
  { label: 'Endgames', pattern: /endgame|ending|rook end|pawn end/i },
  { label: 'Strategy & concepts', pattern: /strateg|concept|plan|pawn structure|positional|lesson|course/i },
  { label: 'Classics', pattern: /classic|immortal|world champion|candidates|olympiad|capablanca|fischer|kasparov|morphy/i },
]

const input = 'rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none'
const primary = 'rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-0.5 text-xs ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`
const row = 'flex items-center justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2 text-sm'
const openBtn = 'shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50'

/**
 * Search for games to study: annotated Lichess studies, classic master games
 * by opening, tournaments, and a chess.com player's games. A chosen game opens
 * in the reader, where it can be replayed and narrated like any book chapter.
 */
export default function GameSearchPage() {
  const navigate = useNavigate()
  const pageWidth = usePageWidth('max-w-3xl')
  const openBook = useExternalBookStore((s) => s.open)
  const [tab, setTab] = useState<Tab>('recommended')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Why the last request failed, when the page can do something about it. */
  const [failure, setFailure] = useState<{ kind: 'auth' | 'offline'; retry: () => void } | null>(null)
  const [tokenDraft, setTokenDraft] = useState('')

  const [author, setAuthor] = useState('lichess')
  const [studies, setStudies] = useState<StudySummary[] | null>(null)
  const [topic, setTopic] = useState<number | null>(null)
  const [filter, setFilter] = useState('')

  const [category, setCategory] = useState<'mates' | 'traps' | 'classics' | 'openings' | 'players'>('mates')
  const [studyLink, setStudyLink] = useState('')
  const [opening, setOpening] = useState<string | null>(null)
  const [masters, setMasters] = useState<MasterGame[] | null>(null)

  const [query, setQuery] = useState('')
  const [broadcasts, setBroadcasts] = useState<BroadcastSummary[] | null>(null)

  const [player, setPlayer] = useState('')
  const [games, setGames] = useState<{ month: string; games: ChessComGame[] } | null>(null)

  async function run<T>(work: () => Promise<T>, retry?: () => void): Promise<T | undefined> {
    setBusy(true)
    setError(null)
    setFailure(null)
    try {
      return await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (e instanceof LichessAuthError) setFailure({ kind: 'auth', retry: retry ?? (() => {}) })
      // fetch rejects with a TypeError when the site cannot be reached (offline, blocked, CORS)
      else if (e instanceof TypeError) setFailure({ kind: 'offline', retry: retry ?? (() => {}) })
      return undefined
    } finally {
      setBusy(false)
    }
  }

  /** Open a PGN in the reader as an in-memory book. */
  const read = (title: string, pgn: string) => {
    const { chapters } = pgnToChapters(pgn)
    if (chapters.length === 0) {
      setError(`"${title}" has no game that starts from the initial position (it may be a puzzle collection).`)
      return
    }
    openBook(title, chapters)
    saveProgress(EXTERNAL_BOOK_ID, 1)
    navigate(`/read/${EXTERNAL_BOOK_ID}`)
  }

  const shownStudies = (studies ?? []).filter(
    (st) =>
      (topic === null || TOPICS[topic].pattern.test(st.name)) &&
      st.name.toLowerCase().includes(filter.trim().toLowerCase()),
  )

  return (
    <div className={`mx-auto ${pageWidth} px-4 py-6`}>
      <h1 className="text-xl font-bold text-slate-800">Game search</h1>
      <p className="mt-1 text-sm text-slate-600">
        Find annotated and instructive games, then open them in the reader to replay and narrate them.
      </p>

      <div role="tablist" aria-label="Sources" className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => { setTab(t.id); setError(null); setFailure(null) }}
            className={`-mb-px rounded-t border px-3 py-1.5 text-sm ${
              tab === t.id ? 'border-slate-200 border-b-white bg-white font-semibold text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {failure?.kind === 'auth' && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault()
            useSettingsStore.getState().set({ lichessToken: tokenDraft.trim() })
            failure.retry()
          }}
        >
          <label className="flex flex-col text-xs text-slate-700">
            Lichess token
            <input className={input} type="password" autoComplete="off" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} />
          </label>
          <button className={primary} disabled={!tokenDraft.trim()}>Save token and retry</button>
          <a className="text-xs text-blue-700 underline" href={LICHESS_TOKEN_URL} target="_blank" rel="noreferrer">
            Create a Lichess token ↗
          </a>
          <span className="w-full text-xs text-slate-500">
            Kept in this browser and sent only to Lichess. The link ticks the permissions this app uses (reading needs none; playing needs board:play and challenge:write).
          </span>
        </form>
      )}
      {failure?.kind === 'offline' && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <p>Lichess cannot be reached. The games under “Recommended” work offline, and so do the games you already opened:</p>
          <ul className="mt-1 flex flex-col gap-1">
            {cachedLichessEntries().map((c) => (
              <li key={c.key} className={row}>
                <span>{c.title}</span>
                <button className={openBtn} aria-label={`Open ${c.title}`} onClick={() => read(c.title, c.pgn)}>Open</button>
              </li>
            ))}
          </ul>
          <button className="mt-1 text-xs text-blue-700 underline" onClick={() => { setTab('recommended'); setError(null); setFailure(null) }}>
            Go to the recommended games
          </button>
        </div>
      )}

      <div role="tabpanel" className="mt-4 flex flex-col gap-3">
        {tab === 'recommended' && (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
              {([
                ['mates', 'Basic checkmates'], ['traps', 'Opening traps'], ['classics', 'Classic games'],
                ['openings', 'Openings by level'], ['players', 'Players and books'],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={category === id} className={chip(category === id)} onClick={() => setCategory(id)}>
                  {label}
                </button>
              ))}
            </div>

            {(category === 'mates' || category === 'traps' || category === 'classics') && (
              <ul className="flex flex-col gap-1.5">
                {RECOMMENDED_GAMES.filter((g) => g.category === category).map((g) => (
                  <li key={g.id} className={row}>
                    <span>
                      <span className="font-medium text-slate-800">{g.title}</span>{' '}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">{g.level}</span>{' '}
                      <span className="text-xs text-slate-500">{Math.ceil(g.plies / 2)} moves</span>
                      <span className="block text-xs text-slate-500">{g.lesson}</span>
                    </span>
                    <button className={openBtn} aria-label={`Open ${g.title}`} onClick={() => read(g.title, g.pgn)}>Open</button>
                  </li>
                ))}
              </ul>
            )}

            {category === 'openings' && (
              <div className="flex flex-col gap-3">
                {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
                  <div key={level}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{level}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {openingsFor(level).map((o) => (
                        <button
                          key={o.id} type="button" className={chip(false)} disabled={busy}
                          onClick={() => {
                            setTab('masters')
                            setOpening(o.id)
                            void run(() => lichessMastersByOpening(o)).then((r) => r && setMasters(r))
                          }}
                        >
                          {o.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-500">Choosing an opening lists its top master games.</p>
              </div>
            )}

            {category === 'players' && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-slate-500">
                  Lichess has no API to search studies by player or book, so these links open the study search on
                  lichess.org. Paste the link of the study you want below to read it here with its comments.
                </p>
                {(['Players', 'Books'] as const).map((group) => (
                  <div key={group}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STUDY_TOPICS.filter((x) => x.group === group).map((x) => (
                        <a key={x.label} className={chip(false)} href={lichessStudySearchUrl(x.query)} target="_blank" rel="noreferrer">
                          {x.label} ↗
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const id = studyIdFrom(studyLink)
                    if (!id) { setError('That is not a Lichess study link (https://lichess.org/study/XXXXXXXX).'); return }
                    void run(() => lichessStudyPgn(id)).then((pgn) => pgn !== undefined && read(`Lichess study ${id}`, pgn))
                  }}
                >
                  <label className="flex flex-1 flex-col text-xs text-slate-600">
                    Lichess study link
                    <input className={input} value={studyLink} onChange={(e) => setStudyLink(e.target.value)} placeholder="https://lichess.org/study/…" />
                  </label>
                  <button className={primary} disabled={busy || !studyLink.trim()}>Open study</button>
                </form>
              </div>
            )}
          </>
        )}

        {tab === 'studies' && (
          <>
            <p className="text-xs text-slate-500">
              Lichess studies keep the author's comments and variations. Lichess has no API to search studies by
              topic, so pick an author and filter their studies. The official <code>lichess</code> account
              publishes annotated games of the main tournaments.
            </p>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => lichessStudiesBy(author)).then((r) => r && setStudies(r))
              }}
            >
              <label className="flex flex-col text-xs text-slate-600">
                Lichess author
                <input className={input} value={author} onChange={(e) => setAuthor(e.target.value)} />
              </label>
              <button className={primary} disabled={busy || !author.trim()}>Search studies</button>
            </form>
            {studies && (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  {TOPICS.map((t, i) => (
                    <button key={t.label} type="button" aria-pressed={topic === i} className={chip(topic === i)} onClick={() => setTopic(topic === i ? null : i)}>
                      {t.label}
                    </button>
                  ))}
                  <input
                    className={`${input} ml-auto w-44`}
                    placeholder="Filter by title…"
                    aria-label="Filter by title"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </div>
                <p className="text-xs text-slate-500">{shownStudies.length} of {studies.length} studies</p>
                <ul className="flex flex-col gap-1.5">
                  {shownStudies.map((st) => (
                    <li key={st.id} className={row}>
                      <span>{st.name}</span>
                      <a className={`${openBtn} ml-auto`} href={lichessStudyUrl(st.id)} target="_blank" rel="noreferrer" aria-label={`${st.name} on Lichess`}>Lichess ↗</a>
                      <button
                        className={openBtn}
                        disabled={busy}
                        aria-label={`Open ${st.name}`}
                        onClick={() => void run(() => lichessStudyPgn(st.id)).then((pgn) => pgn !== undefined && read(st.name, pgn))}
                      >
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {tab === 'masters' && (
          <>
            <p className="text-xs text-slate-500">
              The top master games of an opening from the Lichess masters database, ranked by the rating of the
              players. These games come without comments. Lichess offers no ranking of studies (most liked or most
              viewed) through its API.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {OPENINGS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={opening === o.id}
                  className={chip(opening === o.id)}
                  disabled={busy}
                  onClick={function load() {
                    setOpening(o.id)
                    const t = useSettingsStore.getState().lichessToken || undefined
                    void run(() => lichessMastersByOpening(o, t), load).then((r) => r && setMasters(r))
                  }}
                >
                  {o.name}
                </button>
              ))}
            </div>
            {masters && (
              <ul className="flex flex-col gap-1.5">
                {masters.length === 0 && <li className="text-sm text-slate-500">No games found.</li>}
                {masters.map((g) => {
                  const title = `${g.white} — ${g.black}`
                  return (
                    <li key={g.id} className={row}>
                      <span>
                        {title} <span className="text-slate-500">({g.year}, {g.result}{g.whiteRating > 0 ? `, Elo ${g.whiteRating}–${g.blackRating}` : ''})</span>
                      </span>
                      <a className={`${openBtn} ml-auto`} href={lichessMasterUrl(g.id)} target="_blank" rel="noreferrer" aria-label={`${title} on Lichess`}>Lichess ↗</a>
                      <button
                        className={openBtn}
                        disabled={busy}
                        aria-label={`Open ${title}`}
                        onClick={function load() {
                          const t = useSettingsStore.getState().lichessToken || undefined
                          void run(() => lichessMasterPgn(g.id, t), load).then((pgn) => pgn !== undefined && read(title, pgn))
                        }}
                      >
                        Open
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'broadcasts' && (
          <>
            <p className="text-xs text-slate-500">Tournaments relayed on Lichess. They open on lichess.org.</p>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => lichessBroadcasts(query)).then((r) => r && setBroadcasts(r))
              }}
            >
              <label className="flex flex-col text-xs text-slate-600">
                Tournament name
                <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <button className={primary} disabled={busy || !query.trim()}>Search tournaments</button>
            </form>
            {broadcasts && (
              <ul className="flex flex-col gap-1.5">
                {broadcasts.length === 0 && <li className="text-sm text-slate-500">No tournaments found.</li>}
                {broadcasts.map((b) => (
                  <li key={b.id} className={row}>
                    <span>{b.name}</span>
                    <a className={`${openBtn} ml-auto`} href={b.url} target="_blank" rel="noreferrer" aria-label={`${b.name} on Lichess`}>Lichess ↗</a>
                    <button
                      className={openBtn}
                      disabled={busy}
                      aria-label={`Open ${b.name} in the study`}
                      onClick={() => void run(() => lichessBroadcastPgn(b.id)).then((pgn) => pgn && read(b.name, pgn))}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'mine' && (
          <MyGamesBrowser open={read} />
        )}

        {tab === 'puzzles' && <PuzzlePanel />}

        {tab === 'chesscom' && (
          <>
            <p className="text-xs text-slate-500">
              Chess.com offers no search for annotated games in its public API. What it does offer is a player's
              own games by month, without comments.
            </p>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  const months = await chessComArchives(player)
                  if (months.length === 0) return { month: '', games: [] }
                  return { month: months[0].label, games: await chessComGames(months[0].url) }
                }).then((r) => r && setGames(r))
              }}
            >
              <label className="flex flex-col text-xs text-slate-600">
                Chess.com username
                <input className={input} value={player} onChange={(e) => setPlayer(e.target.value)} />
              </label>
              <button className={primary} disabled={busy || !player.trim()}>Find games</button>
            </form>
            {games && (
              <>
                <p className="text-xs text-slate-500">
                  {games.games.length} games{games.month ? ` in ${games.month} (latest month)` : ''}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {games.games.slice(0, 50).map((g, i) => {
                    const title = `${g.white} — ${g.black}`
                    return (
                      <li key={g.url || i} className={row}>
                        <span>{title}</span>
                        <button className={openBtn} aria-label={`Open ${title}`} onClick={() => read(title, g.pgn)}>Open</button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

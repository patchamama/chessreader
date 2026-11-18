import { useState } from 'react'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { withBusy } from '../../shared/layout/busyStore'
import { lichessAccount, type MyGame } from './myGames'
import { loadGameIndex, type YearGroup } from './myGamesIndex'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const btn = 'shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50'
const toggle = (on: boolean) => `rounded px-2 py-0.5 text-xs font-medium ${on ? 'bg-slate-700 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`
/** Games shown at a time in the flat list, to keep the page light. */
const PAGE = 50

/** One game: players with ratings, result and how it ended, moves, opening, speed, date; a link to the site and Open. */
function GameRow({ g, open }: { g: MyGame; open: (title: string, pgn: string) => void }) {
  const title = `${g.white}${g.whiteElo ? ` (${g.whiteElo})` : ''} – ${g.black}${g.blackElo ? ` (${g.blackElo})` : ''}`
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1 text-xs">
      <span><strong>{title}</strong> · {g.result} ({g.ending}) · {g.moves} moves · {g.opening || '—'} · {g.speed} · {g.date}</span>
      <span className="flex gap-1">
        <a className={btn} href={g.url} target="_blank" rel="noreferrer" aria-label={`${title} on ${g.source === 'lichess' ? 'Lichess' : 'Chess.com'}`}>↗</a>
        <button className={btn} aria-label={`Open ${title}`} onClick={() => open(title, g.pgn)}>Open</button>
      </span>
    </li>
  )
}

/**
 * Your games on Lichess (token in Settings) or chess.com (user name in
 * Settings), newest first: either by year and month — only those with games,
 * with how many — or all in one list.
 */
export function MyGamesBrowser({ open }: { open: (title: string, pgn: string) => void }) {
  const token = useSettingsStore((s) => s.lichessToken)
  const chessComUser = useSettingsStore((s) => s.chessComUser)
  const [source, setSource] = useState<'lichess' | 'chesscom'>(token || !chessComUser ? 'lichess' : 'chesscom')
  const [index, setIndex] = useState<YearGroup[] | null>(null)
  const [read, setRead] = useState<number | null>(null)
  const [view, setView] = useState<'months' | 'all'>('months')
  const [openYear, setOpenYear] = useState<number | null>(null)
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set())
  const [shown, setShown] = useState(PAGE)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setError(null)
    setIndex(null)
    setOpenYear(null)
    setOpenMonths(new Set())
    setShown(PAGE)
    setRead(0)
    try {
      await withBusy('Reading your games…', async () => {
        const user = source === 'lichess' ? (await lichessAccount(token)).username : chessComUser
        setIndex(await loadGameIndex(source, user, token, setRead))
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRead(null)
    }
  }

  const toggleMonth = (key: string, isOpen: boolean) => setOpenMonths((s) => {
    if (s.has(key) === isOpen) return s
    const next = new Set(s)
    if (isOpen) next.add(key)
    else next.delete(key)
    return next
  })

  const missing = source === 'lichess' ? !token : !chessComUser
  const all = index ? index.flatMap((y) => y.months.flatMap((m) => m.games)) : []
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">Source
          <select aria-label="Games source" className="rounded border border-slate-300 px-1 py-0.5" value={source} onChange={(e) => { setSource(e.target.value as 'lichess' | 'chesscom'); setIndex(null) }}>
            <option value="lichess">Lichess</option>
            <option value="chesscom">Chess.com</option>
          </select>
        </label>
        <button className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50" disabled={missing || read !== null} onClick={() => void start()}>Load my games</button>
        {missing && <span className="text-xs text-slate-500">{source === 'lichess' ? 'Set your Lichess token in Settings → Accounts.' : 'Set your chess.com user name in Settings → Accounts.'}</span>}
        {read !== null && <span role="status" className="text-xs text-slate-500">Reading your games… {read}</span>}
      </div>
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
      {index && (
        <>
          <div className="flex items-center gap-1" role="group" aria-label="Games view">
            <button className={toggle(view === 'months')} aria-pressed={view === 'months'} onClick={() => setView('months')}>By year and month</button>
            <button className={toggle(view === 'all')} aria-pressed={view === 'all'} onClick={() => setView('all')}>All games</button>
            <span className="text-xs text-slate-500">{all.length} games</span>
          </div>
          {all.length === 0 && <p className="text-xs text-slate-500">No games yet.</p>}
          {view === 'months' ? (
            <ul className="flex flex-col gap-1" aria-label="Years">
              {index.map(({ year, count, months }) => (
                <li key={year} className="rounded border border-slate-200 bg-white">
                  <button className="w-full px-3 py-1.5 text-left text-sm font-semibold" aria-expanded={openYear === year} onClick={() => setOpenYear(openYear === year ? null : year)}>
                    {openYear === year ? '▾' : '▸'} {year} ({count})
                  </button>
                  {openYear === year && (
                    <ul className="flex flex-col gap-1 px-3 pb-2">
                      {months.map(({ month, games }) => {
                        const key = `${year}-${month}`
                        return (
                          <li key={month}>
                            <details onToggle={(e) => toggleMonth(key, (e.target as HTMLDetailsElement).open)}>
                              <summary className="cursor-pointer text-sm text-slate-700">{MONTHS[month - 1]} {year} ({games.length})</summary>
                              {openMonths.has(key) && (
                                <ul className="mt-1 flex flex-col gap-1">
                                  {games.map((g) => <GameRow key={g.id} g={g} open={open} />)}
                                </ul>
                              )}
                            </details>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <ul className="flex flex-col gap-1" aria-label="All games">
                {all.slice(0, shown).map((g) => <GameRow key={g.id} g={g} open={open} />)}
              </ul>
              {shown < all.length && <button className={`${btn} self-start`} onClick={() => setShown(shown + PAGE)}>Show more</button>}
            </>
          )}
        </>
      )}
    </div>
  )
}

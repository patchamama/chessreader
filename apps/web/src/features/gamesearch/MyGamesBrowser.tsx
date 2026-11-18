import { useState } from 'react'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { chessComGamesOfMonth, lichessAccount, lichessGamesOfMonth, monthsBetween, type MyGame } from './myGames'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const btn = 'shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50'

/**
 * Your games on Lichess (token in Settings) or chess.com (user name in
 * Settings), year by year and month by month, newest first: players with
 * ratings, result and how it ended, opening, number of moves.
 */
export function MyGamesBrowser({ open }: { open: (title: string, pgn: string) => void }) {
  const token = useSettingsStore((s) => s.lichessToken)
  const chessComUser = useSettingsStore((s) => s.chessComUser)
  const [source, setSource] = useState<'lichess' | 'chesscom'>(token || !chessComUser ? 'lichess' : 'chesscom')
  const [account, setAccount] = useState<{ username: string; since: Date } | null>(null)
  const [games, setGames] = useState<Record<string, MyGame[] | 'loading' | string>>({})
  const [openYear, setOpenYear] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setError(null)
    setGames({})
    try {
      if (source === 'lichess') {
        const a = await lichessAccount(token)
        setAccount({ username: a.username, since: new Date(a.createdAt) })
      } else {
        // chess.com: the last three years (its archive list can be long)
        const now = new Date()
        setAccount({ username: chessComUser, since: new Date(Date.UTC(now.getUTCFullYear() - 2, 0, 1)) })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const loadMonth = async (year: number, month: number) => {
    const key = `${year}-${month}`
    if (games[key] && games[key] !== 'loading' && typeof games[key] !== 'string') return
    setGames((g) => ({ ...g, [key]: 'loading' }))
    try {
      const list = source === 'lichess' ? await lichessGamesOfMonth(token, account!.username, year, month) : await chessComGamesOfMonth(account!.username, year, month)
      setGames((g) => ({ ...g, [key]: list }))
    } catch (e) {
      setGames((g) => ({ ...g, [key]: e instanceof Error ? e.message : String(e) }))
    }
  }

  const missing = source === 'lichess' ? !token : !chessComUser
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">Source
          <select aria-label="Games source" className="rounded border border-slate-300 px-1 py-0.5" value={source} onChange={(e) => { setSource(e.target.value as 'lichess' | 'chesscom'); setAccount(null) }}>
            <option value="lichess">Lichess</option>
            <option value="chesscom">Chess.com</option>
          </select>
        </label>
        <button className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50" disabled={missing} onClick={() => void start()}>Load my games</button>
        {missing && <span className="text-xs text-slate-500">{source === 'lichess' ? 'Set your Lichess token in Settings → Accounts.' : 'Set your chess.com user name in Settings → Accounts.'}</span>}
      </div>
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
      {account && (
        <ul className="flex flex-col gap-1" aria-label="Years">
          {monthsBetween(account.since, new Date()).map(({ year, months }) => (
            <li key={year} className="rounded border border-slate-200 bg-white">
              <button className="w-full px-3 py-1.5 text-left text-sm font-semibold" aria-expanded={openYear === year} onClick={() => setOpenYear(openYear === year ? null : year)}>
                {openYear === year ? '▾' : '▸'} {year}
              </button>
              {openYear === year && (
                <ul className="flex flex-col gap-1 px-3 pb-2">
                  {months.map((m) => {
                    const key = `${year}-${m}`
                    const list = games[key]
                    return (
                      <li key={m}>
                        <details onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void loadMonth(year, m) }}>
                          <summary className="cursor-pointer text-sm text-slate-700">{MONTHS[m - 1]} {year}{Array.isArray(list) ? ` · ${list.length} games` : ''}</summary>
                          {list === 'loading' && <p className="text-xs text-slate-500">Loading…</p>}
                          {typeof list === 'string' && list !== 'loading' && <p role="alert" className="text-xs text-red-700">{list}</p>}
                          {Array.isArray(list) && (
                            <ul className="mt-1 flex flex-col gap-1">
                              {list.length === 0 && <li className="text-xs text-slate-500">No games this month.</li>}
                              {list.map((g) => {
                                const title = `${g.white}${g.whiteElo ? ` (${g.whiteElo})` : ''} – ${g.black}${g.blackElo ? ` (${g.blackElo})` : ''}`
                                return (
                                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1 text-xs">
                                    <span><strong>{title}</strong> · {g.result} ({g.ending}) · {g.moves} moves · {g.opening || '—'} · {g.speed} · {g.date}</span>
                                    <span className="flex gap-1">
                                      <a className={btn} href={g.url} target="_blank" rel="noreferrer" aria-label={`${title} on ${g.source === 'lichess' ? 'Lichess' : 'Chess.com'}`}>↗</a>
                                      <button className={btn} aria-label={`Open ${title}`} onClick={() => open(title, g.pgn)}>Open</button>
                                    </span>
                                  </li>
                                )
                              })}
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
      )}
    </div>
  )
}

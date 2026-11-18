import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from '../../shared/chess/ChessBoard'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { LinePlayer } from '../../shared/chess/LinePlayer'
import { InfoSection } from '../../shared/info/InfoSection'
import { dueTraps, filterTraps, loadTraps, recordPractice, trapProgress, type Trap } from './traps'

const stars = (n: number | null) => (n ? '●'.repeat(n) + '○'.repeat(5 - n) : '—')
const cleanCategory = (c: string) => c.replace(/^Cap[ií]tulo\s+[IVXL]+\s*/i, '').toLowerCase().replace(/^./, (x) => x.toUpperCase())

/** Practise one trap: you play the side that sets it, the opponent falls into it. */
export function TrapPractice({ trap, onDone }: { trap: Trap; onDone: (clean: boolean) => void }) {
  const lang = useSettingsStore((s) => s.language)
  const [ply, setPly] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [message, setMessage] = useState('')
  const mine = (i: number) => (i % 2 === 0) === (trap.side === 'white')
  // The opponent's moves are played for you.
  useEffect(() => {
    if (ply < trap.sans.length && !mine(ply)) {
      const id = setTimeout(() => setPly((p) => p + 1), 400)
      return () => clearTimeout(id)
    }
    if (ply >= trap.sans.length) onDone(mistakes === 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ply])
  const chess = useMemo(() => { const c = new Chess(); trap.sans.slice(0, ply).forEach((m) => c.move(m)); return c }, [trap, ply])
  const last = ply > 0 ? chess.history({ verbose: true }).at(-1) : null
  const drop = (from: string, to: string) => {
    if (ply >= trap.sans.length || !mine(ply)) return false
    const c = new Chess(chess.fen())
    let san = ''
    try { san = c.move({ from, to, promotion: 'q' }).san } catch { return false }
    if (san.replace(/[+#]/g, '') !== trap.sans[ply].replace(/[+#]/g, '')) {
      setMistakes((m) => m + 1)
      setMessage(lang === 'es' ? `No es la jugada de la celada. Era ${trap.sans[ply]}.` : `Not the trap's move. It was ${trap.sans[ply]}.`)
      return false
    }
    setMessage('')
    setPly(ply + 1)
    return true
  }
  return (
    <div className="flex flex-col gap-2 md:flex-row">
      <div className="w-full max-w-[420px]">
        <ChessBoard fen={chess.fen()} orientation={trap.side} lastMove={last ? { from: last.from, to: last.to } : null} allowDragging onPieceDrop={drop} />
      </div>
      <div className="flex-1 text-sm">
        <h3 className="font-semibold">{lang === 'es' && trap.titleEs ? trap.titleEs : trap.title}</h3>
        <p className="text-xs text-slate-600">{trap.opening} · {trap.side === 'white' ? 'White' : 'Black'} sets it{trap.trapMove ? ` on move ${trap.trapMove}` : ''}</p>
        <p className="mt-1">{lang === 'es' && trap.introEs ? trap.introEs : trap.intro}</p>
        <p data-testid="trap-progress" className="mt-2 font-mono text-xs">{trap.sans.slice(0, ply).map((m, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${m}`).join(' ')}</p>
        {message && <p role="alert" className="text-red-700">{message}</p>}
        {ply >= trap.sans.length && <p role="status" className="font-semibold text-emerald-700">{mistakes === 0 ? 'Trap set perfectly!' : `Done, with ${mistakes} mistake(s).`}</p>}
        {ply >= trap.sans.length && <LinePlayer fen={new Chess().fen()} moves={trap.sans} orientation={trap.side} testId="trap-line" className="mt-2" />}
        <InfoSection topic="trap" idea={lang === 'es' && trap.introEs ? trap.introEs : trap.intro} opening={trap.opening} themes={trap.themes} testId="trap-info" />
        <p className="mt-2 text-[11px] text-slate-500">{trap.source.author ? `${trap.source.author}, ` : ''}{trap.source.title}</p>
      </div>
    </div>
  )
}

/**
 * Trap training: the traps of the books and the classic ones, searchable by
 * name, opening or theme, filtered by side, kind and how likely the opponent
 * falls; practise one, and it comes back on the day it is due.
 */
export function TrapTrainer() {
  const lang = useSettingsStore((s) => s.language)
  const [traps, setTraps] = useState<Trap[] | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [side, setSide] = useState<'' | 'white' | 'black'>('')
  const [minFall, setMinFall] = useState(0)
  const [onlyDue, setOnlyDue] = useState(false)
  const [current, setCurrent] = useState<Trap | null>(null)
  const [, setTick] = useState(0)
  useEffect(() => { void loadTraps().then(setTraps) }, [])
  if (!traps) return <p className="text-sm text-slate-500">Loading traps…</p>
  const categories = [...new Set(traps.map((t) => t.category))]
  const shown = filterTraps(onlyDue ? dueTraps(traps) : traps, { q, category, side, minFall })
  const progress = trapProgress()
  const field = 'rounded border border-slate-300 px-1 py-0.5 text-sm'
  return (
    <div className="flex flex-col gap-3">
      <InfoSection topic="traps" testId="traps-info" />
      {current && <TrapPractice key={current.id} trap={current} onDone={(clean) => { recordPractice(current.id, clean); setTick((t) => t + 1) }} />}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input aria-label="Search traps" placeholder="Name, opening, theme…" className={field} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Kind of trap" className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All kinds</option>
          {categories.map((c) => <option key={c} value={c}>{cleanCategory(c)}</option>)}
        </select>
        <select aria-label="Side" className={field} value={side} onChange={(e) => setSide(e.target.value as '' | 'white' | 'black')}>
          <option value="">Both sides</option><option value="white">White sets it</option><option value="black">Black sets it</option>
        </select>
        <label className="flex items-center gap-1">Falls at least
          <select aria-label="Fall probability" className={field} value={minFall} onChange={(e) => setMinFall(Number(e.target.value))}>
            {[0, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n ? stars(n) : 'any'}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />Due for practice</label>
        <span className="text-xs text-slate-500">{shown.length} / {traps.length}</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
          <li key={t.id} className="rounded border border-slate-200 bg-white p-2 text-sm">
            <p className="font-semibold">{lang === 'es' && t.titleEs ? t.titleEs : t.title}</p>
            <p className="text-xs text-slate-600">{t.opening} · {t.side === 'white' ? 'White' : 'Black'}{t.trapMove ? ` · move ${t.trapMove}` : ''} · {cleanCategory(t.category)}</p>
            <p className="text-[11px] text-slate-500">setup {stars(t.setup)} · falls {stars(t.fall)} · tactics {stars(t.tactic)}</p>
            {t.themes.length > 0 && <p className="text-[11px] text-slate-500">{t.themes.join(', ')}</p>}
            <div className="mt-1 flex items-center gap-2">
              <button className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white" onClick={() => setCurrent(t)} aria-label={`Practise ${t.title}`}>Practise</button>
              {progress[t.id] && <span className="text-[11px] text-slate-500">box {progress[t.id].box}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

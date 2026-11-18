import { useEffect, useMemo, useState } from 'react'
import { OpenBookAtTrap } from './OpenBookAtTrap'
import { Chess } from 'chess.js'
import { useSettingsStore, type AppLanguage } from '../../shared/settings/settingsStore'
import { HoverLine } from '../../shared/chess/HoverLine'
import { playLine, type LinePosition } from '../../shared/chess/playLine'
import { InfoSection } from '../../shared/info/InfoSection'
import { openAnalysisBoard } from '../library/analysis/analysisBoards'
import { dueTraps, filterTraps, isBookTrap, loadTraps, recordPractice, trapProgress, type Trap } from './traps'
import { figurinesOn, localSan, localText, wrongMoveText } from './trapNotation'
import { ideaSegments } from './trapText'
import { firstMoves } from './trapExplorer'
import { TrapBoard } from './TrapBoard'
import { TrapIdeaText } from './TrapIdeaText'
import { TrapTryout } from './TrapTryout'

const stars = (n: number | null) => (n ? '●'.repeat(n) + '○'.repeat(5 - n) : '—')
const cleanCategory = (c: string) => c.replace(/^Cap[ií]tulo\s+[IVXL]+\s*/i, '').toLowerCase().replace(/^./, (x) => x.toUpperCase())

type Mode = 'practice' | 'learn'

const T: Record<AppLanguage, {
  learn: string; practise: string; first: string; prev: string; next: string; last: string; play: string; pause: string; idea: string; book: string
  sets: (side: 'white' | 'black', move: number | null) => string; perfect: string; done: (n: number) => string; step: string
}> = {
  en: { learn: 'Learn step by step', practise: 'Practise now', first: 'First position', prev: 'Previous move', next: 'Next move', last: 'Last move', play: 'Play', pause: 'Pause', idea: 'The idea', book: 'Read it in the book',
    sets: (side, m) => `${side === 'white' ? 'White' : 'Black'} sets it${m ? ` on move ${m}` : ''}`, perfect: 'Trap set perfectly!', done: (n) => `Done, with ${n} mistake(s).`, step: 'Watch the trap move by move, then practise it.' },
  es: { learn: 'Aprender paso a paso', practise: 'Practicar ahora', first: 'Posición inicial', prev: 'Jugada anterior', next: 'Siguiente jugada', last: 'Última jugada', play: 'Reproducir', pause: 'Pausa', idea: 'La idea', book: 'Leerla en el libro',
    sets: (side, m) => `La tienden las ${side === 'white' ? 'blancas' : 'negras'}${m ? ` en la jugada ${m}` : ''}`, perfect: '¡Celada tendida a la perfección!', done: (n) => `Hecho, con ${n} error(es).`, step: 'Mira la celada jugada a jugada y luego practícala.' },
  de: { learn: 'Schritt für Schritt lernen', practise: 'Jetzt üben', first: 'Ausgangsstellung', prev: 'Vorheriger Zug', next: 'Nächster Zug', last: 'Letzter Zug', play: 'Abspielen', pause: 'Pause', idea: 'Die Idee', book: 'Im Buch lesen',
    sets: (side, m) => `${side === 'white' ? 'Weiß' : 'Schwarz'} stellt sie${m ? ` im ${m}. Zug` : ''}`, perfect: 'Falle perfekt gestellt!', done: (n) => `Fertig, mit ${n} Fehler(n).`, step: 'Sieh dir die Falle Zug für Zug an und übe sie dann.' },
}

const STEP_MS = 1000
const ARROW = '#16a34a'

/** The positions of a trap line (SAN), from the start. */
function linePositions(sans: string[]) {
  return playLine(new Chess().fen(), sans).positions
}

/** The text a trap from a book is told with, for the analysis board. */
const bookText = (trap: Trap) => [cleanCategory(trap.category), trap.opening, trap.intro].filter(Boolean).join('\n\n')

/**
 * Practise one trap: you play the side that sets it, the opponent falls into
 * it. A learning mode plays it move by move first. A wrong move shows the
 * expected one with an arrow and lit squares; the idea text replays its moves
 * and marks its squares on this same board (no other board opens).
 */
export function TrapPractice({ trap, onDone, initialMode = 'practice' }: { trap: Trap; onDone: (clean: boolean) => void; initialMode?: Mode }) {
  const lang = useSettingsStore((s) => s.language)
  const figurines = useSettingsStore((s) => figurinesOn(s))
  const t = T[lang] ?? T.en
  const [mode, setMode] = useState<Mode>(initialMode)
  const [ply, setPly] = useState(0)
  const [view, setView] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [mistakes, setMistakes] = useState(0)
  const [message, setMessage] = useState('')
  const [expected, setExpected] = useState<{ from: string; to: string } | null>(null)
  const [preview, setPreview] = useState<LinePosition | null>(null)
  const [marked, setMarked] = useState<string[]>([])
  const positions = useMemo(() => linePositions(trap.sans), [trap])
  const total = positions.length
  const done = ply >= trap.sans.length
  const mine = (i: number) => (i % 2 === 0) === (trap.side === 'white')
  // The opponent's moves are played for you.
  useEffect(() => {
    if (mode !== 'practice') return
    if (ply < trap.sans.length && !mine(ply)) {
      const id = setTimeout(() => setPly((p) => p + 1), 400)
      return () => clearTimeout(id)
    }
    if (ply >= trap.sans.length) { setView(total); onDone(mistakes === 0) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ply, mode])
  // Learning mode: the trap plays by itself, one move a second.
  useEffect(() => {
    if (!playing) return
    if (view >= total) { setPlaying(false); return }
    const id = setTimeout(() => setView((v) => Math.min(v + 1, total)), STEP_MS)
    return () => clearTimeout(id)
  }, [playing, view, total])

  const navigating = mode === 'learn' || done
  const shownPly = navigating ? view : ply
  const at = shownPly > 0 ? positions[shownPly - 1] : null
  const fen = preview?.fen ?? at?.fen ?? new Chess().fen()
  const lastMove = preview ? { from: preview.from, to: preview.to } : at ? { from: at.from, to: at.to } : null

  const go = (n: number) => { setPlaying(false); setPreview(null); setMarked([]); setView(Math.max(0, Math.min(total, n))) }
  const startPractice = () => { setMode('practice'); setPlaying(false); setPreview(null); setMarked([]); setExpected(null); setMessage(''); setPly(0); setMistakes(0) }
  const startLearning = () => { setMode('learn'); setPreview(null); setMarked([]); setExpected(null); setMessage(''); setView(0) }

  const move = (from: string, to: string) => {
    if (mode !== 'practice' || done || !mine(ply)) return false
    const c = new Chess(positions[ply - 1]?.fen ?? new Chess().fen())
    let san = ''
    try { san = c.move({ from, to, promotion: 'q' }).san } catch { return false }
    setPreview(null)
    setMarked([])
    if (san.replace(/[+#]/g, '') !== trap.sans[ply].replace(/[+#]/g, '')) {
      setMistakes((m) => m + 1)
      setExpected({ from: positions[ply].from, to: positions[ply].to })
      setMessage(wrongMoveText(lang, localSan(trap.sans[ply], lang, figurines)))
      return false
    }
    setExpected(null)
    setMessage('')
    setPly(ply + 1)
    return true
  }

  const intro = lang === 'es' && trap.introEs ? trap.introEs : trap.intro
  const introLang = (lang === 'es' && trap.introEs) || isBookTrap(trap) ? 'es' : 'en'
  const segments = useMemo(() => ideaSegments(intro, trap, introLang), [intro, trap, introLang])
  const showPosition = (p: LinePosition) => { setPlaying(false); setMarked([]); setPreview(p) }
  const idea = <TrapIdeaText segments={segments} lang={lang} figurines={figurines} onPosition={showPosition} onSquares={setMarked} />
  const lineText = localText(trap.sans.slice(0, ply).map((m, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${m}`).join(' '), lang, figurines)
  const fullLine = localText(trap.sans.map((m, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${m}`).join(' '), lang, figurines)
  const button = 'rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  const openInBook = () => openAnalysisBoard({
    title: lang === 'es' && trap.titleEs ? trap.titleEs : trap.title, moves: trap.sans, ply: trap.sans.length, text: bookText(trap),
    source: [trap.source.author, trap.source.title, trap.ref?.chapter].filter(Boolean).join(', '),
  })

  return (
    <div className="flex flex-col items-start gap-3 md:flex-row">
      <TrapBoard fen={fen} orientation={trap.side} lastMove={lastMove}
        arrows={expected && !preview ? [{ startSquare: expected.from, endSquare: expected.to, color: ARROW }] : []}
        expected={expected && !preview ? [expected.from, expected.to] : []} marked={marked} onMove={move} />
      <div className="min-w-0 flex-1 text-sm">
        <h3 className="font-semibold">{lang === 'es' && trap.titleEs ? trap.titleEs : trap.title}</h3>
        <p className="text-xs text-slate-600">{trap.opening} · {t.sets(trap.side, trap.trapMove)}</p>
        <p className="mt-1">{idea}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <button type="button" className={`${button} ${mode === 'learn' ? 'bg-slate-100 font-semibold' : ''}`} onClick={startLearning}>{t.learn}</button>
          <button type="button" className={`${button} ${mode === 'practice' && !done ? 'bg-slate-100 font-semibold' : ''}`} onClick={startPractice}>{t.practise}</button>
          {isBookTrap(trap) && <button type="button" className={button} onClick={openInBook}>📖 {t.book}</button>}
          {trap.ref?.bookId && trap.ref.chapter && <OpenBookAtTrap book={{ id: trap.ref.bookId, title: trap.source.title }} chapter={Number(trap.ref.chapter)} />}
        </div>
        {mode === 'learn' && <p className="mt-1 text-xs text-slate-500">{t.step}</p>}
        {mode === 'practice' && <p data-testid="trap-progress" className="mt-2 font-mono text-xs">{lineText}</p>}
        {message && <p role="alert" className="text-red-700">{message}</p>}
        {mode === 'practice' && done && <p role="status" className="font-semibold text-emerald-700">{mistakes === 0 ? t.perfect : t.done(mistakes)}</p>}
        {navigating && (
          <div data-testid="trap-line" className="mt-2 flex flex-col gap-1">
            <HoverLine text={fullLine} positions={positions} testId="trap-line-moves" className="font-mono text-xs" current={view - 1} onPick={(i) => go(i + 1)} />
            <div className="flex gap-1">
              <button type="button" className={button} aria-label={t.first} title={t.first} disabled={view === 0} onClick={() => go(0)}>⏮</button>
              <button type="button" className={button} aria-label={t.prev} title={t.prev} disabled={view === 0} onClick={() => go(view - 1)}>◀</button>
              {playing
                ? <button type="button" className={button} aria-label={t.pause} title={t.pause} onClick={() => setPlaying(false)}>⏸</button>
                : <button type="button" className={button} aria-label={t.play} title={t.play} onClick={() => { setPreview(null); if (view >= total) setView(0); setPlaying(true) }}>▶︎</button>}
              <button type="button" className={button} aria-label={t.next} title={t.next} disabled={view >= total} onClick={() => go(view + 1)}>▶</button>
              <button type="button" className={button} aria-label={t.last} title={t.last} disabled={view >= total} onClick={() => go(total)}>⏭</button>
            </div>
          </div>
        )}
        <div className="mt-2">
          <InfoSection topic="trap" opening={trap.opening} themes={trap.themes} testId="trap-info">
            {intro && <p><strong>{t.idea}:</strong> <span>{idea}</span></p>}
          </InfoSection>
        </div>
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
  const [firstMove, setFirstMove] = useState('')
  const [tab, setTab] = useState<'list' | 'try'>('list')
  const [current, setCurrent] = useState<{ trap: Trap; mode: Mode } | null>(null)
  const figurines = useSettingsStore((s) => figurinesOn(s))
  const [, setTick] = useState(0)
  useEffect(() => { void loadTraps().then(setTraps) }, [])
  if (!traps) return <p className="text-sm text-slate-500">Loading traps…</p>
  const categories = [...new Set(traps.map((t) => t.category))]
  const shown = filterTraps(onlyDue ? dueTraps(traps) : traps, { q, category, side, minFall, firstMove })
  const starts = firstMoves(traps)
  const progress = trapProgress()
  const field = 'rounded border border-slate-300 px-1 py-0.5 text-sm'
  return (
    <div className="flex flex-col gap-3">
      <InfoSection topic="traps" testId="traps-info" />
      <div className="flex gap-1 text-sm" role="group" aria-label="Trap training mode">
        <button type="button" aria-pressed={tab === 'list'} onClick={() => setTab('list')}
          className={`rounded border px-2 py-0.5 ${tab === 'list' ? 'border-blue-600 bg-blue-50 font-semibold' : 'border-slate-300'}`}>Practise traps</button>
        <button type="button" aria-pressed={tab === 'try'} onClick={() => setTab('try')}
          className={`rounded border px-2 py-0.5 ${tab === 'try' ? 'border-blue-600 bg-blue-50 font-semibold' : 'border-slate-300'}`}>Try a trap</button>
      </div>
      {tab === 'try' && <TrapTryout traps={traps} />}
      {tab === 'list' && <>
      {current && <TrapPractice key={`${current.trap.id}:${current.mode}`} trap={current.trap} initialMode={current.mode} onDone={(clean) => { recordPractice(current.trap.id, clean); setTick((t) => t + 1) }} />}
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
        <select aria-label="First move" className={field} value={firstMove} onChange={(e) => setFirstMove(e.target.value)}>
          <option value="">Any first move</option>
          {starts.map((m) => <option key={m} value={m}>1. {localSan(m, lang, figurines)}</option>)}
        </select>
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
              <button className="rounded border border-blue-600 px-2 py-0.5 text-xs text-blue-700" onClick={() => setCurrent({ trap: t, mode: 'learn' })} aria-label={`Learn ${t.title}`}>Learn</button>
              <button className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white" onClick={() => setCurrent({ trap: t, mode: 'practice' })} aria-label={`Practise ${t.title}`}>Practise</button>
              {progress[t.id] && <span className="text-[11px] text-slate-500">box {progress[t.id].box}</span>}
            </div>
          </li>
        ))}
      </ul>
      </>}
    </div>
  )
}

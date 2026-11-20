import { useState } from 'react'
import { HoverLine } from '../../../shared/chess/HoverLine'
import { playLine } from '../../../shared/chess/playLine'
import { shortScore, type Lang } from '@chess-ebook/chess-shared'
import EvalBar from '../../viewer/components/EvalBar'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { evaluateDiagram, useDiagramEvalStore, type DiagramLine } from './diagramEvalStore'
import { bookLine, evalWords, fromWhite } from './diagramEvalText'
import type { MoveBefore } from '../utils/inferDiagramFen'
import { formatSan } from '../../../shared/chess/notation'
import type { AppLanguage, NotationStyle } from '../../../shared/settings/settingsStore'

const T: Record<Lang, { again: string; first: string; busy: string; after: string; book: string; which: string; main: string; variation: string }> = {
  es: { again: 'Volver a evaluar este diagrama', first: 'Evaluar este diagrama', busy: 'Evaluando…', after: 'Evaluando tras', book: 'Evaluando la posición del FEN del libro', which: '¿Evaluar hasta qué jugada?', main: 'Línea principal', variation: 'Variante' },
  en: { again: 'Evaluate this diagram again', first: 'Evaluate this diagram', busy: 'Evaluating…', after: 'Evaluating after', book: 'Evaluating the position of the book\'s FEN', which: 'Evaluate up to which move?', main: 'Main line', variation: 'Variation' },
  de: { again: 'Dieses Diagramm neu bewerten', first: 'Dieses Diagramm bewerten', busy: 'Bewerte…', after: 'Bewerte nach', book: 'Bewerte die Stellung der FEN des Buches', which: 'Bis zu welchem Zug bewerten?', main: 'Hauptvariante', variation: 'Nebenvariante' },
}

/** "12...Nb6" in the reader's notation. */
function moveLabel(m: MoveBefore, lang: Lang, style: NotationStyle): string {
  return `${m.moveNumber}${m.color === 'black' ? '...' : '.'}${formatSan(m.san, lang as AppLanguage, style)}`
}

const samePosition = (a: string, b: string) => a.split(' ').slice(0, 2).join(' ') === b.split(' ').slice(0, 2).join(' ')

/** A minimalist refresh icon (spins while working). */
export function RefreshIcon({ spinning = false, className = 'h-3 w-3' }: { spinning?: boolean; className?: string }) {
  return (
    <svg className={`${className}${spinning ? ' animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

/** A line of the engine whose moves show the position on hover (S7). */
function EngineLine({ fen, line, lang, max, className, testId, suffix }: { fen: string; line: DiagramLine; lang: Lang; max: number; className: string; testId: string; suffix?: string }) {
  return <HoverLine text={bookLine(fen, line, lang, max)} positions={playLine(fen, line.pv, max).positions} className={className} testId={testId} suffix={suffix} />
}

/**
 * Under a book diagram, as books print it: who is better and by how much, the
 * engine and depth, the engine's line, and other moves worth playing with their
 * score; an evaluation bar if chosen, and a button to evaluate it (again).
 */
export function DiagramEvalFooter({ fen: diagramFen, main = null, variation = null }: {
  fen: string
  /** The last main-line move written before the diagram (S14). */
  main?: MoveBefore | null
  /** A variation move written after it, just before the diagram: the reader picks which one to evaluate. */
  variation?: MoveBefore | null
}) {
  const lang = useSettingsStore((s) => s.language) as Lang
  const style = useSettingsStore((s) => s.notationStyle) as NotationStyle
  const showBar = useSettingsStore((s) => s.diagramEvalBar)
  const [fen, setFen] = useState(diagramFen)
  const e = useDiagramEvalStore((s) => s.get(fen))
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const t = T[lang] ?? T.en
  // The diagram's own position is the book's FEN when it differs from the main line's.
  const bookFen = !main || !samePosition(main.fen, diagramFen)
  const run = async (position: string, label: string) => {
    setChoosing(false)
    setFen(position)
    setTarget(label)
    setBusy(true)
    // The engine chosen in Settings evaluates it again (S2).
    try { await evaluateDiagram(position, { engine: 'settings' }) } catch { /* no engine: nothing to show */ } finally { setBusy(false); setTarget(null) }
  }
  const evaluateMain = () => void run(diagramFen, bookFen || !main ? t.book : `${t.after} ${moveLabel(main, lang, style)}`)
  const refresh = () => {
    if (variation && !bookFen) setChoosing(true)
    else evaluateMain()
  }
  const best = e?.lines[0]
  const whiteBest = best ? fromWhite(best, fen) : null
  return (
    <span className="mt-1 block text-center text-[0.8em] leading-snug text-slate-600" data-no-recognition>
      {whiteBest && best && e && (
        <>
          {showBar && (
            <span className="mx-auto mb-1 block max-w-[320px]">
              <EvalBar fen={fen} direction="horizontal" score={whiteBest.mate !== undefined ? { mate: whiteBest.mate } : { scoreCp: whiteBest.cp }} />
            </span>
          )}
          <span data-testid="diagram-eval-words" className="block">{evalWords(fen, e, lang)}</span>
          <EngineLine fen={fen} line={best} lang={lang} max={6} testId="diagram-eval-line" className="block text-slate-800" />
          {e.lines.slice(1, 3).map((l, i) => (
            <EngineLine key={i} fen={fen} line={l} lang={lang} max={4} testId="diagram-eval-alt" className="block italic text-slate-500" suffix={` (${shortScore(fromWhite(l, fen))})`} />
          ))}
        </>
      )}
      {busy && target && <span data-testid="diagram-eval-target" className="block text-[0.9em] italic text-amber-700">{target}…</span>}
      {choosing && main && variation && (
        <span role="group" aria-label={t.which} className="my-1 flex flex-wrap items-center justify-center gap-1">
          <span>{t.which}</span>
          <button type="button" onClick={evaluateMain} className="rounded border border-slate-300 px-1.5 hover:bg-slate-100">
            {t.main} ({moveLabel(main, lang, style)})
          </button>
          <button type="button" onClick={() => void run(variation.fen, `${t.after} ${moveLabel(variation, lang, style)}`)} className="rounded border border-slate-300 px-1.5 hover:bg-slate-100">
            {t.variation} ({moveLabel(variation, lang, style)})
          </button>
        </span>
      )}
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        aria-label={e ? t.again : t.first}
        aria-busy={busy || undefined}
        title={busy ? t.busy : e ? t.again : t.first}
        className="mt-0.5 inline-flex items-center gap-1 rounded p-0.5 align-middle text-[0.9em] text-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
      >
        <RefreshIcon spinning={busy} />
        {!e && !busy && <span>{t.first}</span>}
      </button>
    </span>
  )
}

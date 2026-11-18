import { useState } from 'react'
import { HoverLine } from '../../../shared/chess/HoverLine'
import { playLine } from '../../../shared/chess/playLine'
import { shortScore, type Lang } from '@chess-ebook/chess-shared'
import EvalBar from '../../viewer/components/EvalBar'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { evaluateDiagram, useDiagramEvalStore, type DiagramLine } from './diagramEvalStore'
import { bookLine, evalWords, fromWhite } from './diagramEvalText'

const T: Record<Lang, { again: string; first: string; busy: string }> = {
  es: { again: 'Volver a evaluar este diagrama', first: 'Evaluar este diagrama', busy: 'Evaluando…' },
  en: { again: 'Evaluate this diagram again', first: 'Evaluate this diagram', busy: 'Evaluating…' },
  de: { again: 'Dieses Diagramm neu bewerten', first: 'Dieses Diagramm bewerten', busy: 'Bewerte…' },
}

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
export function DiagramEvalFooter({ fen }: { fen: string }) {
  const lang = useSettingsStore((s) => s.language) as Lang
  const showBar = useSettingsStore((s) => s.diagramEvalBar)
  const e = useDiagramEvalStore((s) => s.get(fen))
  const [busy, setBusy] = useState(false)
  const t = T[lang] ?? T.en
  const refresh = async () => {
    setBusy(true)
    // The engine chosen in Settings evaluates it again (S2).
    try { await evaluateDiagram(fen, { engine: 'settings' }) } catch { /* no engine: nothing to show */ } finally { setBusy(false) }
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
      <button
        type="button"
        onClick={() => void refresh()}
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

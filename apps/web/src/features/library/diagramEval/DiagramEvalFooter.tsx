import { useState } from 'react'
import { evalText, localLine, numberLine, shortScore, type Lang, type Score } from '@chess-ebook/chess-shared'
import EvalBar from '../../viewer/components/EvalBar'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { uciLineToSan } from '../review/reviewEngine'
import { evaluateDiagram, useDiagramEvalStore, type DiagramLine } from './diagramEvalStore'

const T: Record<Lang, { again: string; first: string; busy: string; depth: string }> = {
  es: { again: 'Volver a evaluar este diagrama', first: 'Evaluar este diagrama', busy: 'Evaluando…', depth: 'prof.' },
  en: { again: 'Evaluate this diagram again', first: 'Evaluate this diagram', busy: 'Evaluating…', depth: 'depth' },
  de: { again: 'Dieses Diagramm neu bewerten', first: 'Dieses Diagramm bewerten', busy: 'Bewerte…', depth: 'Tiefe' },
}

/** A side-to-move score as seen from White. */
const fromWhite = (l: DiagramLine, fen: string): Score => {
  const sign = fen.split(' ')[1] === 'b' ? -1 : 1
  return l.mate !== undefined ? { mate: sign * l.mate } : { cp: sign * (l.scoreCp ?? 0) }
}

/** The line in the moves of the book: numbered, with the piece letters of the language. */
function bookLine(fen: string, l: DiagramLine, lang: Lang, max: number): string {
  const sans = uciLineToSan(fen, l.pv, max)
  const [, turn, , , , moveNo] = fen.split(' ')
  return localLine(numberLine(sans, Number(moveNo) || 1, turn === 'b' ? 'black' : 'white'), lang)
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
    try { await evaluateDiagram(fen) } catch { /* no engine: nothing to show */ } finally { setBusy(false) }
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
          <span data-testid="diagram-eval-words" className="block">{evalText(whiteBest, lang)} · {e.engine}, {t.depth} {e.depth}</span>
          <span data-testid="diagram-eval-line" className="block text-slate-800">{bookLine(fen, best, lang, 6)}</span>
          {e.lines.slice(1, 3).map((l, i) => (
            <span key={i} data-testid="diagram-eval-alt" className="block italic text-slate-500">{bookLine(fen, l, lang, 4)} ({shortScore(fromWhite(l, fen))})</span>
          ))}
        </>
      )}
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={busy}
        aria-label={e ? t.again : t.first}
        title={e ? t.again : t.first}
        className="mt-0.5 rounded px-1 text-[0.9em] text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
      >
        {busy ? t.busy : e ? '⟳' : `⟳ ${t.first}`}
      </button>
    </span>
  )
}

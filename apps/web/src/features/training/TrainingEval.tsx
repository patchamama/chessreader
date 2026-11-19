import { numberLine } from '@chess-ebook/chess-shared'
import EvalBar from '../viewer/components/EvalBar'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { figurinesOn, localText } from './trapNotation'
import type { TrainingEval } from './trainingEngine'
import { pvToSan, scoreText } from './evalText'

/**
 * The vertical evaluation bar of a training board: it stands at the right of
 * the board and stretches to its height (the row it sits in is the board's).
 */
export function TrainingEvalBar({ fen, result }: { fen: string; result: TrainingEval }) {
  return (
    <div data-testid="training-eval-bar" className="flex w-3 shrink-0 justify-center self-stretch">
      <EvalBar fen={fen} direction="vertical" score={{ scoreCp: result.scoreCp, mate: result.mate, loading: result.loading }} />
    </div>
  )
}

/** The engine's score and best line of a training board, in the notation of the settings. */
export function TrainingEvalLine({ fen, result }: { fen: string; result: TrainingEval }) {
  const lang = useSettingsStore((s) => s.language)
  const figurines = useSettingsStore((s) => figurinesOn(s))
  const [, turn, , , , no] = fen.split(' ')
  const best = pvToSan(fen, result.pv).slice(0, 6)
  const hasScore = result.scoreCp !== undefined || result.mate !== undefined
  const line = best.length ? localText(numberLine(best, Number(no) || 1, turn === 'b' ? 'black' : 'white'), lang, figurines) : ''
  return (
    <p data-testid="training-eval" className="mt-1 font-mono text-xs text-slate-700">
      {hasScore ? <strong>{scoreText(result)}</strong> : <span className="text-slate-400">…</span>}
      {line && <span> · {line}</span>}
    </p>
  )
}

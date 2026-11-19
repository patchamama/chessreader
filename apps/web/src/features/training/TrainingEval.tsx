import { numberLine } from '@chess-ebook/chess-shared'
import EvalBar from '../viewer/components/EvalBar'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { figurinesOn, localText } from './trapNotation'
import { useTrainingEngine } from './trainingEngine'
import { pvToSan, scoreText } from './evalText'

/** The evaluation bar of a training board, with the engine's score and best line in the notation of the settings. */
export function TrainingEval({ fen }: { fen: string }) {
  const lang = useSettingsStore((s) => s.language)
  const figurines = useSettingsStore((s) => figurinesOn(s))
  const result = useTrainingEngine(fen, true)
  const [, turn, , , , no] = fen.split(' ')
  const best = pvToSan(fen, result.pv).slice(0, 6)
  const hasScore = result.scoreCp !== undefined || result.mate !== undefined
  const line = best.length ? localText(numberLine(best, Number(no) || 1, turn === 'b' ? 'black' : 'white'), lang, figurines) : ''
  return (
    <div data-testid="training-eval" className="mt-1 flex flex-col gap-1 text-xs">
      <EvalBar fen={fen} direction="horizontal" score={{ scoreCp: result.scoreCp, mate: result.mate, loading: result.loading }} />
      <p className="font-mono text-slate-700">
        {hasScore ? <strong>{scoreText(result)}</strong> : <span className="text-slate-400">…</span>}
        {line && <span> · {line}</span>}
      </p>
    </div>
  )
}

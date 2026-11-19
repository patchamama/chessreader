import { useEffect, useState } from 'react'
import { engineSafeFen } from '../../shared/stockfish/safeFen'
import { createStockfishWorker } from '../../shared/stockfish/stockfishWorker'
import { STOCKFISH_VERSIONS, useSettingsStore } from '../../shared/settings/settingsStore'

/** Scores are from White's side (the engine gives them from the side to move). */
export interface TrainingEval { loading: boolean; scoreCp?: number; mate?: number; pv: string[] }

/** A training board needs a quick look, not a deep analysis. */
const MAX_DEPTH = 18

/**
 * The engine's evaluation and best line of a training board position, only
 * while `enabled` (the board's "Show evaluation" option): no engine runs otherwise.
 */
export function useTrainingEngine(fen: string, enabled: boolean): TrainingEval {
  const version = useSettingsStore((s) => s.stockfishVersion)
  const depth = useSettingsStore((s) => Math.min(MAX_DEPTH, s.engineDepth || MAX_DEPTH))
  const [state, setState] = useState<TrainingEval>({ loading: false, pv: [] })
  useEffect(() => {
    if (!enabled || !engineSafeFen(fen)) { setState({ loading: false, pv: [] }); return }
    let worker: Worker
    try { worker = createStockfishWorker(STOCKFISH_VERSIONS[version].url) } catch { setState({ loading: false, pv: [] }); return }
    setState({ loading: true, pv: [] })
    worker.onmessage = (e: MessageEvent) => {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      if (data?.type !== 'lines' || data.fen !== fen) return
      const best = data.lines?.[0]
      if (!best) return
      const sign = fen.split(' ')[1] === 'b' ? -1 : 1
      setState({
        loading: !data.final, pv: best.pv ?? [],
        scoreCp: best.scoreCp === undefined ? undefined : sign * best.scoreCp,
        mate: best.mate === undefined ? undefined : sign * best.mate,
      })
    }
    worker.postMessage({ type: 'lines', fen, depth, count: 1 })
    return () => worker.terminate()
  }, [fen, enabled, version, depth])
  return state
}

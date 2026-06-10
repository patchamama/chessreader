import { useState, useEffect, useRef } from 'react'
import { createStockfishWorker } from './stockfishWorker'
import { useSettingsStore, STOCKFISH_VERSIONS } from '../settings/settingsStore'

export interface EngineLine {
  idx: number
  pv: string[]
  scoreCp?: number
  mate?: number
  depth: number
}

const linesCache = new Map<string, EngineLine[]>()

export function useEngineLines(fen: string, count = 5): { lines: EngineLine[]; loading: boolean } {
  const stockfishVersion = useSettingsStore((s) => s.stockfishVersion)
  const sfUrl = STOCKFISH_VERSIONS[stockfishVersion].url

  const [state, setState] = useState<{ lines: EngineLine[]; loading: boolean }>(() => {
    const cached = linesCache.get(fen)
    return cached ? { lines: cached, loading: false } : { lines: [], loading: true }
  })

  const workerRef = useRef<Worker | null>(null)
  const fenRef    = useRef<string>(fen)
  const sfUrlRef  = useRef<string>(sfUrl)

  // Recreate worker when sfUrl changes
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    sfUrlRef.current = sfUrl
    linesCache.clear()

    const worker = createStockfishWorker(sfUrl)
    worker.onmessage = (e: MessageEvent) => {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      if (data.type !== 'lines') return
      if (data.fen !== fenRef.current) return
      linesCache.set(data.fen, data.lines)
      setState({ lines: data.lines, loading: false })
    }
    workerRef.current = worker

    setState({ lines: [], loading: true })
    workerRef.current.postMessage({ type: 'lines', fen: fenRef.current, count, depth: 14 })

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [sfUrl, count])

  useEffect(() => {
    fenRef.current = fen
    if (!workerRef.current) return

    const cached = linesCache.get(fen)
    if (cached) {
      setState({ lines: cached, loading: false })
      return
    }

    setState({ lines: [], loading: true })
    workerRef.current.postMessage({ type: 'lines', fen, count, depth: 14 })
  }, [fen, count])

  return state
}

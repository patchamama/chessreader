import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { httpClient } from '../../../shared/api/httpClient'
import { isDemoHost } from '../../../shared/env/devMode'
import { useAuthStore } from '../../auth/store/authStore'
import { useSettingsStore, STOCKFISH_VERSIONS } from '../../../shared/settings/settingsStore'
import { reviewEngine } from '../review/reviewStore'

/** One engine line: UCI moves and the score for the side to move. */
export interface DiagramLine { pv: string[]; scoreCp?: number; mate?: number }

/** The engine's view of a diagram's position: who evaluated it, how deep, its best lines. */
export interface DiagramEvaluation { engine: string; depth: number; lines: DiagramLine[]; at: number }

const MAX = 600
/** Positions are the same diagram whatever the move counters say. */
const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

interface DiagramEvalState {
  byFen: Record<string, DiagramEvaluation>
  get: (fen: string) => DiagramEvaluation | undefined
  put: (fen: string, e: DiagramEvaluation) => void
}

/** Evaluations of book diagrams, kept in this browser (they can be replaced at any time). */
export const useDiagramEvalStore = create<DiagramEvalState>()(
  persist(
    (set, get) => ({
      byFen: {},
      get: (fen) => get().byFen[key(fen)],
      put: (fen, e) => set((s) => {
        const entries = Object.entries({ ...s.byFen, [key(fen)]: e })
        // Keep the most recent ones.
        const kept = entries.length > MAX ? entries.sort((a, b) => b[1].at - a[1].at).slice(0, MAX) : entries
        return { byFen: Object.fromEntries(kept) }
      }),
    }),
    { name: 'chessreader-diagram-evals', partialize: (s) => ({ byFen: s.byFen }) },
  ),
)

interface ServerEval { depth: number; scoreCp?: number; mate?: number; pv?: string[]; engineName?: string; lines?: ServerEval[] }

const localEngineName = () => {
  const s = useSettingsStore.getState()
  const label = STOCKFISH_VERSIONS[s.stockfishVersion].label.replace(/\s*\(.*\)\s*$/, '')
  return s.engineSource === 'lichess-cloud' ? `Lichess cloud / ${label}` : label
}

/**
 * The best `count` lines of a position: from the server's Stockfish when there
 * is a server and a session, else from the engine in this browser (or the
 * Lichess cloud, when chosen in Settings).
 */
export async function evaluatePosition(fen: string, depth: number, count: number): Promise<DiagramEvaluation> {
  if (!isDemoHost() && useAuthStore.getState().token) {
    try {
      const r = await httpClient<ServerEval>('/api/eval/position', { method: 'POST', body: JSON.stringify({ fen, depth, lines: count }) })
      const lines = (r.lines ?? [r]).filter((l) => l.pv?.length).map((l) => ({ pv: l.pv!, ...(l.mate !== undefined ? { mate: l.mate } : { scoreCp: l.scoreCp ?? 0 }) }))
      if (lines.length) return { engine: r.engineName ?? 'Stockfish', depth: r.depth || depth, lines, at: Date.now() }
    } catch {
      // the server could not answer: the browser engine does
    }
  }
  const lines = await reviewEngine()(fen, depth, count)
  return {
    engine: localEngineName(),
    depth: lines[0]?.depth ?? depth,
    lines: lines.filter((l) => l.pv.length).map((l) => ({ pv: l.pv, ...(l.mate !== undefined ? { mate: l.mate } : { scoreCp: l.scoreCp ?? 0 }) })),
    at: Date.now(),
  }
}

/** Evaluate one diagram with the depth and number of lines of Settings, and keep it. */
export async function evaluateDiagram(fen: string): Promise<DiagramEvaluation> {
  const { diagramEvalDepth, diagramEvalLines } = useSettingsStore.getState()
  const e = await evaluatePosition(fen, diagramEvalDepth, diagramEvalLines)
  useDiagramEvalStore.getState().put(fen, e)
  return e
}

/**
 * Evaluate the diagrams of a chapter, one after another: only those without
 * an evaluation ('missing'), or all of them again ('replace').
 */
export async function evaluateDiagrams(fens: string[], mode: 'missing' | 'replace', onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  const unique = [...new Map(fens.map((f) => [key(f), f])).values()]
  const todo = mode === 'replace' ? unique : unique.filter((f) => !useDiagramEvalStore.getState().get(f))
  for (let i = 0; i < todo.length; i++) {
    if (signal?.aborted) return
    await evaluateDiagram(todo[i])
    onProgress?.(i + 1, todo.length)
  }
}

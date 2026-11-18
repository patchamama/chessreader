import { useEffect, useState } from 'react'
import ChessBoard from '../../shared/chess/ChessBoard'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { loadPatternIndex, patternPuzzle } from '../gamesearch/patterns'
import { puzzleMove, puzzlePosition, type Puzzle } from '../gamesearch/puzzles'
import { answerLevel, LEVEL_PUZZLES, levelMargin, startLevel, type LevelState } from './levelEstimate'

const KEY = 'chessreader-level'

/**
 * How strong are you? Fifteen puzzles from the Lichess database (CC0), each
 * chosen near the current estimate; the estimate moves after every one. The
 * result sets the level of the Maia hints and of the pattern puzzles.
 */
export function LevelTest() {
  const set = useSettingsStore((s) => s.set)
  const [state, setState] = useState<LevelState | null>(null)
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [ply, setPly] = useState(0)
  const [themes, setThemes] = useState<string[]>([])
  const [last] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as { rating: number; margin: number; at: string } | null } catch { return null } })
  useEffect(() => { void loadPatternIndex().then((t) => setThemes(t.map((x) => x.theme)), () => setThemes([])) }, [])

  const next = async (s: LevelState) => {
    setState(s)
    if (s.answered >= LEVEL_PUZZLES) {
      const result = { rating: s.rating, margin: levelMargin(s), at: new Date().toISOString().slice(0, 10) }
      try { localStorage.setItem(KEY, JSON.stringify(result)) } catch { /* not kept */ }
      // Maia's levels go from 1100 to 1900: the hints use the nearest.
      set({ playHumanRating: Math.min(1900, Math.max(1100, Math.round(s.rating / 100) * 100)) })
      setPuzzle(null)
      return
    }
    const theme = themes[Math.floor(Math.random() * themes.length)] ?? 'fork'
    setPuzzle(await patternPuzzle(theme, s.rating))
    setPly(0)
  }

  const drop = (from: string, to: string) => {
    if (!puzzle || !state) return false
    const position = puzzlePosition(puzzle, ply)
    const piece = position.get(from as never)
    const promotes = piece?.type === 'p' && (to[1] === '8' || to[1] === '1')
    const r = puzzleMove(puzzle, ply, `${from}${to}${promotes ? 'q' : ''}`)
    if (r.result === 'correct') { setPly(r.next); return true }
    void next(answerLevel(state, puzzle.rating, r.result === 'solved'))
    return r.result === 'solved'
  }

  if (!state || (state.answered >= LEVEL_PUZZLES && !puzzle)) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        {state && state.answered >= LEVEL_PUZZLES && (
          <p role="status" className="text-lg font-semibold">Your level: about {state.rating} ± {levelMargin(state)} (puzzle rating)</p>
        )}
        {last && !state && <p className="text-slate-600">Last test ({last.at}): {last.rating} ± {last.margin}</p>}
        <p className="text-slate-600">{LEVEL_PUZZLES} puzzles from the Lichess database, each near your current estimate. Other ways to know your level: play a few games against the Lichess Maia bots (1100/1500/1900) or Stockfish at set levels and look at your accuracy in the engine review; your Lichess or chess.com rating, if you have one, is the best measure.</p>
        <div><button className="rounded bg-blue-600 px-3 py-1 text-white" disabled={themes.length === 0} onClick={() => void next(startLevel(last?.rating ?? 1500))}>Start the test</button></div>
      </div>
    )
  }
  const position = puzzle ? puzzlePosition(puzzle, ply) : null
  const lastMove = puzzle ? (ply === 0 ? puzzle.lastMove : puzzle.solution[ply - 1]) : null
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <div className="w-full max-w-[420px]">
        {position && <ChessBoard fen={position.fen()} orientation={puzzle!.fen.split(' ')[1] === 'b' ? 'black' : 'white'} lastMove={lastMove ? { from: lastMove.slice(0, 2), to: lastMove.slice(2, 4) } : null} allowDragging onPieceDrop={drop} />}
      </div>
      <div className="text-sm">
        <p className="font-semibold">Puzzle {state.answered + 1} / {LEVEL_PUZZLES}</p>
        <p data-testid="level-estimate" className="text-slate-600">Estimate: {state.rating} ± {levelMargin(state)}</p>
        <p className="mt-1 text-xs text-slate-500">Find the best move for the side to play. One wrong move counts the puzzle as failed.</p>
        <button className="mt-2 text-xs underline" onClick={() => puzzle && void next(answerLevel(state, puzzle.rating, false))}>Skip (counts as failed)</button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { loadPatternIndex, patternPuzzle, type PatternTheme } from './patterns'
import { Chess } from 'chess.js'
import ChessBoard from '../../shared/chess/ChessBoard'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { lichessDailyPuzzle, lichessNextPuzzle, puzzleMove, puzzlePosition, type Puzzle } from './puzzles'

const primary = 'rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
const plain = 'rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50'

type Status = 'solving' | 'wrong' | 'solved'

/** The solution written as moves, from the puzzle's position. */
function solutionText(p: Puzzle): string {
  const chess = new Chess(p.fen)
  const parts: string[] = []
  for (const m of p.solution) {
    const [, , , , , moveNo] = chess.fen().split(' ')
    const white = chess.turn() === 'w'
    const san = chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }).san
    parts.push(white ? `${moveNo}. ${san}` : parts.length === 0 ? `${moveNo}... ${san}` : san)
  }
  return parts.join(' ')
}

/**
 * Lichess puzzles: the puzzle of the day, or a new one chosen for the user's
 * rating when there is a token. The board answers each right move with the
 * opponent's reply, as on Lichess.
 */
export function PuzzlePanel({ initialTheme }: { initialTheme?: string } = {}) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [themes, setThemes] = useState<PatternTheme[] | null>(null)
  const [theme, setTheme] = useState(initialTheme ?? 'fork')
  const lang = useSettingsStore((s) => s.language)
  const [ply, setPly] = useState(0)
  const [status, setStatus] = useState<Status>('solving')
  const [showSolution, setShowSolution] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (next: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const { lichessToken } = useSettingsStore.getState()
      const p = next ? await lichessNextPuzzle(lichessToken || undefined) : await lichessDailyPuzzle()
      setPuzzle(p)
      setPly(0)
      setStatus('solving')
      setShowSolution(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** A puzzle of a tactical pattern, near the player's level (S4). */
  const loadPattern = async () => {
    setBusy(true)
    setError(null)
    try {
      const p = await patternPuzzle(theme, useSettingsStore.getState().playHumanRating || 1500)
      setPuzzle(p)
      setPly(0)
      setStatus('solving')
      setShowSolution(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { void loadPatternIndex().then(setThemes, () => setThemes([])) }, [])

  const solver: 'white' | 'black' = puzzle?.fen.split(' ')[1] === 'b' ? 'black' : 'white'
  const position = puzzle ? puzzlePosition(puzzle, ply) : null
  const lastMove = puzzle
    ? ply === 0
      ? { from: puzzle.lastMove.slice(0, 2), to: puzzle.lastMove.slice(2, 4) }
      : { from: puzzle.solution[ply - 1].slice(0, 2), to: puzzle.solution[ply - 1].slice(2, 4) }
    : null

  const drop = (from: string, to: string): boolean => {
    if (!puzzle || status === 'solved') return false
    const piece = position?.get(from as never)
    const promotes = piece?.type === 'p' && (to[1] === '8' || to[1] === '1')
    const step = puzzleMove(puzzle, ply, `${from}${to}${promotes ? 'q' : ''}`)
    if (step.result === 'wrong') {
      setStatus('wrong')
      return false
    }
    if (step.result === 'solved') {
      setPly(puzzle.solution.length)
      setStatus('solved')
      return true
    }
    // Right move: the opponent's reply follows on the board.
    setPly(step.next)
    setStatus('solving')
    return true
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        Puzzles from Lichess, taken from real games. Find the best move for the side to play; a right move is answered by the opponent.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={busy} onClick={() => void load(false)}>Puzzle of the day</button>
        <button className={plain} disabled={busy} onClick={() => void load(true)}>New puzzle</button>
      </div>
      {themes && themes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">Train a pattern
            <select aria-label="Pattern" className="rounded border border-slate-300 px-1 py-0.5" value={theme} onChange={(e) => setTheme(e.target.value)}>
              {themes.map((x) => <option key={x.theme} value={x.theme}>{lang === 'es' ? x.es : x.en} ({x.count})</option>)}
            </select>
          </label>
          <button className={plain} disabled={busy} onClick={() => void loadPattern()}>Pattern puzzle</button>
          <span className="text-xs text-slate-500">Lichess puzzle database (CC0)</span>
        </div>
      )}
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>}
      {puzzle && position && (
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="w-full max-w-[400px]">
            <ChessBoard fen={position.fen()} orientation={solver} lastMove={lastMove} allowDragging={status !== 'solved'} onPieceDrop={drop} />
          </div>
          <div className="flex flex-1 flex-col gap-2 text-sm">
            <p className="font-semibold">{solver === 'white' ? 'White to play' : 'Black to play'}</p>
            <p role="status" className={status === 'solved' ? 'font-semibold text-emerald-700' : status === 'wrong' ? 'text-red-700' : 'text-slate-600'}>
              {status === 'solved' ? 'Solved!' : status === 'wrong' ? 'Not the move. Try again.' : ply > 0 ? 'Right! Keep going.' : 'Your move.'}
            </p>
            <p className="text-xs text-slate-600">Rating {puzzle.rating} · played {puzzle.plays.toLocaleString()} times</p>
            <p className="text-xs text-slate-600">Themes: {puzzle.themes.join(', ')}</p>
            <a className="text-xs text-blue-700 underline" href={puzzle.game.url} target="_blank" rel="noreferrer">
              {puzzle.game.white} – {puzzle.game.black}{puzzle.game.perf ? ` (${puzzle.game.perf})` : ''}
            </a>
            <div>
              <button className={plain} onClick={() => setShowSolution(true)}>Show the solution</button>
            </div>
            {showSolution && <p className="text-xs text-slate-700">Solution: {solutionText(puzzle)}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

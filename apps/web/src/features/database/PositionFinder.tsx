import { useState } from 'react'
import { lookupPositionComments, type HumanComment } from '../library/commentdb/commentLookup'
import { parsePositionInput, type PositionMove } from './positionInput'
import CommentCard from './CommentCard'

/** Find by position (S2): paste a FEN, or a PGN and pick any of its moves, and see the comments of that position. */
export default function PositionFinder() {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [moves, setMoves] = useState<PositionMove[]>([])
  const [shown, setShown] = useState<{ fen: string; comments: HumanComment[] } | null>(null)
  const [picked, setPicked] = useState<number | null>(null)

  const show = async (fen: string) => {
    try {
      setShown({ fen, comments: await lookupPositionComments(fen) })
      setError(null)
    } catch (e) {
      setError(`The comments could not be read: ${(e as Error).message}`)
    }
  }
  const find = () => {
    const r = parsePositionInput(text)
    setShown(null)
    setPicked(null)
    if (r.kind === 'error') { setMoves([]); setError(r.message); return }
    setError(null)
    if (r.kind === 'fen') { setMoves([]); void show(r.fen); return }
    setMoves(r.moves)
  }

  return (
    <details className="mb-2 rounded border border-slate-200 p-2 text-sm">
      <summary className="cursor-pointer font-medium">Find by position</summary>
      <div className="mt-2 flex flex-col gap-2">
        <textarea aria-label="FEN or PGN" rows={3} className="rounded border border-slate-300 px-2 py-1 font-mono text-xs" placeholder="Paste a FEN or a PGN" value={text} onChange={(e) => setText(e.target.value)} />
        <div><button className="rounded border border-slate-300 px-2 py-0.5" onClick={find}>Find</button></div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {moves.length > 0 && (
          <ul aria-label="Moves" className="flex flex-wrap gap-1">
            {moves.map((m, i) => (
              <li key={i}>
                <button className={`rounded border px-1.5 py-0.5 font-mono text-xs ${picked === i ? 'border-violet-700 bg-violet-100' : 'border-slate-300'}`} aria-pressed={picked === i} onClick={() => { setPicked(i); void show(m.fen) }}>{m.label}</button>
              </li>
            ))}
          </ul>
        )}
        {shown && (shown.comments.length
          ? <ul aria-label="Comments for this position" className="flex flex-col gap-2">{shown.comments.map((c, i) => <CommentCard key={i} comment={c} fen={shown.fen} />)}</ul>
          : <p className="text-slate-600">No comments for this position.</p>)}
      </div>
    </details>
  )
}

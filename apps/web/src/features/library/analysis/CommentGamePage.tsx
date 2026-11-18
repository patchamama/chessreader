import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { withBusy } from '../../../shared/layout/busyStore'
import { OpenInStudy } from '../../gamesearch/OpenInStudy'
import { AnalysisBoardView } from './AnalysisBoardView'
import { loadCommentGame, type CommentGame } from './commentGame'

const players = (g: CommentGame) => [g.white, g.black].filter(Boolean).join(' – ') || 'Commented game'
const sourceText = (g: CommentGame) => {
  const s = typeof g.source === 'object' && g.source ? [g.source.author?.split(/\s+/).pop(), g.source.title].filter(Boolean).join(', ') : ''
  return [s, g.label].filter(Boolean).join(', ')
}

/**
 * `/comment/:gameId?ply=N` — the book game a comment comes from, opened in a
 * tab of its own (so the current study is not lost): the game on an analysis
 * board at the commented ply, and a button to open it in the study.
 */
export default function CommentGamePage() {
  const { gameId = '' } = useParams()
  const [params] = useSearchParams()
  const ply = Math.max(0, Number(params.get('ply')) || 0)
  const [game, setGame] = useState<CommentGame | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setGame(null)
    setError(null)
    withBusy('Opening the commented game…', () => loadCommentGame(gameId))
      .then((g) => { if (live) setGame(g) })
      .catch((e: Error) => { if (live) setError(`Could not open the commented game: ${e.message}`) })
    return () => { live = false }
  }, [gameId])

  if (error) return <p role="alert" className="p-4 text-sm text-red-600">{error}</p>
  if (!game) return null
  const title = players(game)
  const source = sourceText(game)

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 p-4">
      <header className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
        {source && <span className="text-sm italic text-slate-500">{source}</span>}
      </header>
      <AnalysisBoardView board={{ title, pgn: game.pgn, ply }} />
      <div>
        <OpenInStudy title={title} load={() => Promise.resolve(game.pgn)} />
      </div>
    </main>
  )
}

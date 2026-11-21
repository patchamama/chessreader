import { useState } from 'react'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { withBusy } from '../../shared/layout/busyStore'
import { openCommentGame, type CommentGameRef } from './openCommentGame'

function Inner({ game, className }: { game: CommentGameRef; className: string }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button type="button" className={className} onClick={() => void withBusy('Opening the game', async () => {
        try { navigate(await openCommentGame(game)) } catch (e) { setError(`Game ${game.gameId}: ${(e as Error).message}`) }
      })}>Open the game</button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </>
  )
}

/** Opens the game a comment was taken from. Renders nothing outside a router. */
export default function OpenGameButton({ game, className = 'rounded border border-slate-300 px-2 py-0.5 text-xs' }: { game: CommentGameRef; className?: string }) {
  return useInRouterContext() ? <Inner game={game} className={className} /> : null
}

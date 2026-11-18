import { useEffect, useRef } from 'react'
import { commentGameHref } from '../analysis/analysisLine'
import { loadCommentGame } from '../analysis/commentGame'
import { openAnalysisBoard } from '../analysis/analysisBoards'
import { withBusy } from '../../../shared/layout/busyStore'

/** A book comment's source link, as the reader found it in the text (S5, S4). */
export interface CommentSourceTarget {
  top: number
  left: number
  gameId: string
  ply: number
  /** The comment's words, to read on the analysis board. */
  text: string
  /** Where it comes from ("Kasparov III"). */
  source: string
}

/**
 * The small menu of a book comment's source: its game in a new browser tab, or
 * in a new analysis board at the commented move (the study board is kept).
 */
export function CommentSourceMenu({ target, onClose }: { target: CommentSourceTarget; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // The click that opened the menu must not close it at once.
    const timer = window.setTimeout(() => document.addEventListener('mousedown', away), 0)
    document.addEventListener('keydown', esc)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const inTab = () => {
    window.open(commentGameHref(target.gameId, target.ply), '_blank', 'noopener')
    onClose()
  }

  const inBoard = () => {
    onClose()
    void withBusy('Opening the commented game', async () => {
      const game = await loadCommentGame(target.gameId)
      const players = game.white && game.black ? `${game.white} – ${game.black}` : game.label || target.source || target.gameId
      openAnalysisBoard({ title: players, pgn: game.pgn, ply: target.ply, text: target.text, source: target.source })
    }).catch(() => { /* the game could not be read: nothing opens */ })
  }

  const item = 'block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100'
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Comment source"
      className="fixed z-50 min-w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
      style={{ top: target.top, left: target.left }}
    >
      <button type="button" role="menuitem" className={item} onClick={inTab}>Open in a new tab</button>
      <button type="button" role="menuitem" className={item} onClick={inBoard}>Open in a new analysis board</button>
    </div>
  )
}

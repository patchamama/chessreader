import { useEffect, useState } from 'react'
import ChessBoardThemed from '../../../shared/chess/ChessBoard'
import EvalBar from '../../viewer/components/EvalBar'
import { useSettingsStore, BOARD_THEMES, PIECE_THEMES, type BoardTheme, type PieceTheme } from '../../../shared/settings/settingsStore'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useStudyNavigation } from '../hooks/useStudyNavigation'
import { useNarrationStore } from '../narration/narrationStore'
import { MoveTooltipCard } from './MoveTooltipCard'

/** How long a narration step takes to say, roughly (words at a calm pace). */
const stepSeconds = (speech: string, rate: number) => Math.max(1, speech.split(/\s+/).length / 2.6) / Math.max(0.25, rate)

/** The narration step to go back to so that about `seconds` are said again. */
export function stepBack(script: { speech: string }[], stepIndex: number, seconds: number, rate = 1): number {
  let i = stepIndex
  let spent = 0
  while (i > 0 && spent < seconds) {
    i--
    spent += stepSeconds(script[i].speech, rate)
  }
  return i
}

/**
 * The study board full screen: the board, the evaluation, the game's moves in
 * two scrolling lines (a thumbnail on hover), previous/next, and — while the
 * narrator reads — pause, resume and back 5/10/15 seconds. A small ⚙ changes
 * the board's look. Keys: ← → to move, Esc to close.
 */
export function BoardModal({ onClose }: { onClose: () => void }) {
  const tree = useStudyBoardStore((s) => s.activeGame)
  const currentNodeId = useStudyBoardStore((s) => s.currentNodeId)
  const orientation = useStudyBoardStore((s) => s.orientation)
  const setCurrentNode = useStudyBoardStore((s) => s.setCurrentNode)
  const nav = useStudyNavigation()
  const narration = useNarrationStore()
  const settings = useSettingsStore()
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') nav.next()
      else if (e.key === 'ArrowLeft') nav.prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, onClose])

  const moves = tree ? tree.mainline.map((id) => tree.nodes.get(id)!) : []
  const narrating = narration.status === 'playing' || narration.status === 'paused'
  const back = (s: number) => narration.goTo(stepBack(narration.script, narration.stepIndex, s, narration.rate))
  const btn = 'rounded bg-white/10 px-2 py-1 text-sm text-white hover:bg-white/20 disabled:opacity-40'
  const hovered = hover && tree ? tree.nodes.get(hover.id) : null

  return (
    <div role="dialog" aria-modal="true" aria-label="Board" className="fixed inset-0 z-[60] flex flex-col bg-slate-900 text-white">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex gap-1">
          <button className={btn} onClick={nav.prev} disabled={!nav.canPrev} aria-label="Previous move">◀</button>
          <button className={btn} onClick={nav.next} disabled={!nav.canNext} aria-label="Next move">▶</button>
          {narrating && (
            <>
              <span className="mx-2 w-px bg-white/20" />
              {[15, 10, 5].map((s) => <button key={s} className={btn} onClick={() => back(s)} aria-label={`Back ${s} seconds`}>⟲{s}</button>)}
              {narration.status === 'playing'
                ? <button className={btn} onClick={narration.pause} aria-label="Pause">⏸</button>
                : <button className={btn} onClick={narration.play} aria-label="Resume">⏵</button>}
            </>
          )}
        </div>
        <div className="flex gap-1">
          <button className={btn} onClick={() => setShowConfig((v) => !v)} aria-label="Board settings">⚙</button>
          <button className={btn} onClick={onClose} aria-label="Close full screen">✕</button>
        </div>
      </div>
      {showConfig && (
        <div className="mx-3 mb-2 flex flex-wrap gap-3 rounded bg-white/10 p-2 text-xs">
          <label className="flex items-center gap-1">Board
            <select aria-label="Board theme" className="rounded bg-slate-800 px-1" value={settings.boardTheme} onChange={(e) => settings.set({ boardTheme: e.target.value as BoardTheme })}>
              {Object.entries(BOARD_THEMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1">Pieces
            <select aria-label="Piece set" className="rounded bg-slate-800 px-1" value={settings.pieceTheme} onChange={(e) => settings.set({ pieceTheme: e.target.value as PieceTheme })}>
              {(Object.keys(PIECE_THEMES) as PieceTheme[]).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={settings.showEval} onChange={(e) => settings.set({ showEval: e.target.checked })} />Evaluation</label>
          <button className="underline" onClick={() => useStudyBoardStore.getState().flip()}>Flip board</button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 px-3">
        {settings.showEval && <div className="h-[min(80vh,90vw)] w-6"><EvalBar fen={nav.fen} direction="vertical" /></div>}
        <div className="aspect-square h-[min(80vh,90vw)]">
          <ChessBoardThemed fen={nav.fen} orientation={orientation} lastMove={nav.lastMove} />
        </div>
      </div>
      {narrating && narration.caption && <p className="px-4 pt-2 text-center text-sm text-slate-200">{narration.caption}</p>}
      <div className="max-h-16 overflow-y-auto px-4 py-2 text-sm leading-7" data-testid="modal-moves">
        {moves.map((n, i) => (
          <span key={n.id}>
            {i % 2 === 0 || i === 0 ? <span className="text-slate-400">{n.moveNumber}{n.color === 'black' ? '…' : '.'}</span> : null}
            <button
              className={`mx-0.5 rounded px-1 ${n.id === currentNodeId ? 'bg-amber-400 text-slate-900' : 'hover:bg-white/10'}`}
              onClick={() => setCurrentNode(n.id, false)}
              onMouseEnter={(e) => setHover({ id: n.id, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHover(null)}
            >{n.san}</button>
          </span>
        ))}
      </div>
      {hovered && tree && (
        <div className="pointer-events-none fixed z-[70] overflow-hidden rounded-lg border border-slate-600 bg-white text-slate-900 shadow-xl" style={{ left: Math.min(hover!.x, window.innerWidth - 230), top: Math.max(8, hover!.y - 300) }}>
          <MoveTooltipCard tree={tree} node={hovered} fen={hovered.fen} lastMove={hovered.from ? { from: hovered.from, to: hovered.to } : null} />
        </div>
      )}
    </div>
  )
}

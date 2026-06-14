import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from '../../../shared/chess/ChessBoard'
import EvalBar from '../../viewer/components/EvalBar'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useStudyNavigation } from '../hooks/useStudyNavigation'
import { MoveStatusRow } from './TurnIndicator'
import { AnnotationToolbar } from './AnnotationToolbar'
import { PenCanvas } from './PenCanvas'
import { VariationChooser } from './VariationChooser'

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function NavButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  )
}

export function StudyBoard() {
  const evalDirection = useSettingsStore((s) => s.evalBarDirection)

  const activeGame = useStudyBoardStore((s) => s.activeGame)
  const orientation = useStudyBoardStore((s) => s.orientation)
  const flip = useStudyBoardStore((s) => s.flip)
  const toolMode = useStudyBoardStore((s) => s.toolMode)
  const annotations = useStudyBoardStore((s) => s.annotations)
  const setArrows = useStudyBoardStore((s) => s.setArrows)
  const toggleHighlight = useStudyBoardStore((s) => s.toggleHighlight)
  const eraseAt = useStudyBoardStore((s) => s.eraseAt)
  const autoplay = useStudyBoardStore((s) => s.autoplay)
  const setAutoplay = useStudyBoardStore((s) => s.setAutoplay)
  const clearGame = useStudyBoardStore((s) => s.clearGame)
  const playFen = useStudyBoardStore((s) => s.playFen)
  const selectedSquare = useStudyBoardStore((s) => s.selectedSquare)
  const legalTargets = useStudyBoardStore((s) => s.legalTargets)
  const selectSquare = useStudyBoardStore((s) => s.selectSquare)
  const playMove = useStudyBoardStore((s) => s.playMove)

  const nav = useStudyNavigation()
  const [showChooser, setShowChooser] = useState(false)
  const [fenInput, setFenInput] = useState(INITIAL_FEN)

  // The navigation/base position (game-driven or manual FEN).
  const baseFen = activeGame ? nav.fen : fenInput
  // The displayed position: a free-play position takes precedence once the user moves.
  const fen = playFen ?? baseFen

  // Autoplay loop.
  useEffect(() => {
    if (!autoplay) return
    const tick = () => {
      if (!nav.canNext || nav.hasChoiceAhead) {
        setAutoplay(false)
        return
      }
      nav.next()
    }
    const interval = window.setInterval(tick, 1200)
    return () => window.clearInterval(interval)
  }, [autoplay, nav, setAutoplay])

  const handleNext = () => {
    if (nav.hasChoiceAhead) {
      setShowChooser(true)
      return
    }
    nav.next()
  }

  const highlightStyles = Object.fromEntries(
    Object.entries(annotations.highlights).map(([sq, color]) => [sq, { backgroundColor: color }]),
  )

  const onSquareClick = (square: string) => {
    if (toolMode === 'highlight') toggleHighlight(square)
    else if (toolMode === 'eraser') eraseAt(square)
    else if (toolMode === 'none') selectSquare(square, baseFen) // click-to-move
  }

  const applyFen = () => {
    try {
      new Chess(fenInput)
      clearGame()
    } catch {
      /* invalid FEN — ignore */
    }
  }

  // Pieces are draggable only when no annotation tool is active (play mode).
  const playMode = toolMode === 'none'

  const boardWrapper = (
    <div className="relative w-full">
      <ChessBoard
        fen={fen}
        orientation={orientation}
        lastMove={!playFen && activeGame ? nav.lastMove : null}
        arrows={annotations.arrows}
        allowDrawingArrows={toolMode === 'arrows'}
        onArrowsChange={setArrows}
        customSquareStyles={highlightStyles}
        onSquareClick={onSquareClick}
        allowDragging={playMode}
        onPieceDrop={playMode ? (from, to) => playMove(from, to, baseFen) : undefined}
        selectedSquare={playMode ? selectedSquare : null}
        legalTargets={playMode ? legalTargets : []}
      />
      <PenCanvas />
    </div>
  )

  // Show "After …" only while following the game; once the user plays freely,
  // show whose turn it is from the live position.
  const statusRow = <MoveStatusRow fen={fen} node={!playFen && activeGame ? nav.node : null} />

  return (
    <div className="flex flex-col gap-3">
      <p className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">Study Board</p>

      {/* Board + eval bar — layout depends on eval bar direction */}
      {evalDirection === 'vertical' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-stretch gap-1">
            <EvalBar fen={fen} direction="vertical" />
            <div className="flex-1">{boardWrapper}</div>
          </div>
          {statusRow}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {boardWrapper}
          <EvalBar fen={fen} direction="horizontal" />
          {statusRow}
        </div>
      )}

      {/* Navigation bar */}
      <div className="relative flex items-center gap-1.5">
        <NavButton onClick={nav.goStart} disabled={!activeGame || !nav.canPrev} title="Start">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 19l-7-7 7-7M11 19l-7-7 7-7" />
          </svg>
        </NavButton>
        <NavButton onClick={nav.prev} disabled={!activeGame || !nav.canPrev} title="Previous move">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </NavButton>
        <NavButton onClick={handleNext} disabled={!activeGame || !nav.canNext} title="Next move">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </NavButton>
        <NavButton
          onClick={() => setAutoplay(!autoplay)}
          disabled={!activeGame || !nav.canNext}
          title={autoplay ? 'Pause autoplay' : 'Autoplay'}
        >
          {autoplay ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 5v14l11-7z" />
            </svg>
          )}
        </NavButton>

        <div className="mx-0.5 h-5 w-px bg-slate-200" />

        <NavButton onClick={nav.variationUp} disabled={!nav.hasChoiceAhead} title="Previous variation">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </NavButton>
        <NavButton onClick={nav.variationDown} disabled={!nav.hasChoiceAhead} title="Next variation">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </NavButton>

        <NavButton onClick={flip} title="Flip board">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </NavButton>

        {showChooser && activeGame && nav.hasChoiceAhead && nav.successorId && (
          <VariationChooser
            tree={activeGame}
            mainlineId={nav.successorId}
            siblingLines={nav.siblingLines}
            onPickMainline={() => {
              nav.next()
              setShowChooser(false)
            }}
            onPickLine={(i) => {
              nav.enterLine(i)
              setShowChooser(false)
            }}
            onClose={() => setShowChooser(false)}
          />
        )}
      </div>

      {/* Annotation toolbar */}
      <AnnotationToolbar />

      {/* FEN input */}
      <div className="flex gap-1.5">
        <input
          value={fenInput}
          onChange={(e) => setFenInput(e.target.value)}
          placeholder="FEN…"
          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs font-mono focus:border-blue-400 focus:outline-none"
        />
        <button
          onClick={applyFen}
          className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Set
        </button>
        <button
          onClick={() => {
            setFenInput(INITIAL_FEN)
            clearGame()
          }}
          title="Reset to start position"
          className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
        >
          ↺
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { GameTree } from '@chess-ebook/chess-shared'
import { useSettingsStore, type AppLanguage } from '../../../shared/settings/settingsStore'
import { StudyBoard } from '../components/StudyBoard'
import { useStudyBoardStore } from '../store/studyBoardStore'
import {
  activateAnalysisBoard, closeAnalysisBoard, newAnalysisBoard, updateAnalysisWork, updateScratchWork, useAnalysisBoards,
  type AnalysisBoard, type AnalysisWork,
} from './analysisBoards'
import { lineOfBoard } from './analysisGame'
import { AnalysisMoveList } from './AnalysisMoveList'
import { AnalysisWorkspace, EMPTY_WORK } from './AnalysisWorkspace'

const T: Record<AppLanguage, { title: string; current: string; close: string; moves: string; add: string; analysis: string }> = {
  en: { title: 'Analysis boards', current: 'Current board', close: 'Close', moves: 'Moves', add: 'New analysis board', analysis: 'Analysis' },
  es: { title: 'Tableros de análisis', current: 'Tablero actual', close: 'Cerrar', moves: 'Jugadas', add: 'Nuevo tablero de análisis', analysis: 'Análisis' },
  de: { title: 'Analysebretter', current: 'Aktuelles Brett', close: 'Schließen', moves: 'Züge', add: 'Neues Analysebrett', analysis: 'Analyse' },
}

/** What a board opened from a book starts with: its line, at the move it was opened on. */
function initialWork(board: AnalysisBoard): AnalysisWork {
  const line = lineOfBoard(board)
  return { ...EMPTY_WORK, ...line, ply: Math.max(0, Math.min(board.ply ?? line.moves.length, line.moves.length)) }
}

/** What a tab is called: the book (or source) the board comes from, else its own title. */
const tabName = (b: AnalysisBoard) => b.source?.trim() || b.title

/** The moves leading to the current node, then the rest of its line (main line or variation). */
function shownLine(tree: GameTree, currentId: string | null): string[] {
  if (!currentId || tree.mainline.includes(currentId)) return tree.mainline
  const path: string[] = []
  for (let id: string | null = currentId; id; id = tree.nodes.get(id)?.parentId ?? null) path.unshift(id)
  for (const lines of tree.variations.values()) {
    const line = lines.find((l) => l.includes(currentId))
    if (line) return [...path, ...line.slice(line.indexOf(currentId) + 1)]
  }
  return path
}

/** The study board's game, as a clickable list of moves; a click moves the (same, live) board there. */
function CurrentGameMoves({ label, tree }: { label: string; tree: GameTree }) {
  const currentId = useStudyBoardStore((s) => s.currentNodeId)
  const setCurrentNode = useStudyBoardStore((s) => s.setCurrentNode)
  return (
    <AnalysisMoveList
      label={label} tree={tree} ids={shownLine(tree, currentId)} currentId={currentId}
      onSelect={(id) => setCurrentNode(id, !tree.mainline.includes(id))}
    />
  )
}

/**
 * The "Analysis board" tab (S11, S10): the current analysis board first — the
 * study board of the reader, live, with its game's moves and all its controls,
 * or, while no game of a book is open, a free board to play or type a game on —
 * then one closable tab per extra analysis board (named after its book) and a
 * "+" that opens a new, empty one. Every board keeps what was done on it.
 */
export default function AnalysisPage() {
  const { boards, active, scratch } = useAnalysisBoards()
  const studyGame = useStudyBoardStore((s) => s.activeGame)
  const lang = useSettingsStore((s) => s.language)
  const t = T[lang] ?? T.en
  const [selected, setSelected] = useState<number | 'current'>('current')
  // A board just opened (or brought to the front elsewhere) is the one shown.
  const [seenActive, setSeenActive] = useState(active)
  if (seenActive !== active) {
    setSeenActive(active)
    if (active !== null) setSelected(active)
  }
  const board = selected === 'current' ? null : boards.find((b) => b.id === selected) ?? null
  const tab = 'max-w-[14rem] truncate px-3 py-1.5 text-sm font-medium text-slate-700'
  const tabBox = (on: boolean) => `flex shrink-0 items-center rounded-t border-b-2 ${on ? 'border-emerald-600 bg-emerald-50' : 'border-transparent hover:bg-slate-50'}`

  return (
    <section className="flex flex-col gap-3" data-testid="analysis-page">
      <div role="tablist" aria-label={t.title} className="flex gap-1 overflow-x-auto border-b border-slate-200">
        <span className={tabBox(!board)}>
          <button type="button" role="tab" aria-selected={!board} className={tab} onClick={() => setSelected('current')}>
            {t.current}
          </button>
        </span>
        {boards.map((b) => (
          <span key={b.id} className={tabBox(board?.id === b.id)}>
            <button
              type="button"
              role="tab"
              aria-selected={board?.id === b.id}
              title={b.source && b.source !== b.title ? `${b.source} — ${b.title}` : b.title}
              className={tab}
              onClick={() => { activateAnalysisBoard(b.id); setSelected(b.id) }}
            >
              {tabName(b)}
            </button>
            <button
              type="button"
              aria-label={`${t.close} ${tabName(b)}`}
              className="px-1.5 text-xs text-slate-400 hover:text-red-600"
              onClick={() => closeAnalysisBoard(b.id)}
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          aria-label={t.add}
          title={t.add}
          className="shrink-0 rounded-t px-3 py-1.5 text-base font-semibold text-slate-500 hover:bg-slate-50 hover:text-emerald-700"
          onClick={() => {
            const used = new Set(boards.map((b) => b.title))
            let n = 1
            while (used.has(`${t.analysis} ${n}`)) n++
            setSelected(newAnalysisBoard(`${t.analysis} ${n}`))
          }}
        >
          +
        </button>
      </div>
      <div role="tabpanel">
        {board ? (
          <AnalysisWorkspace
            key={board.id}
            title={tabName(board)}
            work={board.work ?? initialWork(board)}
            onChange={(work) => updateAnalysisWork(board.id, work)}
            comment={board.text}
            source={board.source}
          />
        ) : studyGame ? (
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,480px)_1fr]">
            <StudyBoard />
            <CurrentGameMoves label={t.moves} tree={studyGame} />
          </div>
        ) : (
          <AnalysisWorkspace title={t.current} work={scratch ?? EMPTY_WORK} onChange={updateScratchWork} />
        )}
      </div>
    </section>
  )
}

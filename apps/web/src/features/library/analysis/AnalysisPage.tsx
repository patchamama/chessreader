import { useState } from 'react'
import type { GameTree } from '@chess-ebook/chess-shared'
import { useSettingsStore, type AppLanguage } from '../../../shared/settings/settingsStore'
import { useNotation } from '../../../shared/chess/notation'
import { StudyBoard } from '../components/StudyBoard'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { activateAnalysisBoard, closeAnalysisBoard, useAnalysisBoards, type AnalysisBoard } from './analysisBoards'
import { AnalysisBoardView } from './AnalysisBoardView'

const T: Record<AppLanguage, { title: string; current: string; close: string; moves: string; empty: string }> = {
  en: { title: 'Analysis boards', current: 'Current board', close: 'Close', moves: 'Moves', empty: 'Open a game in a book: the board follows it here, move by move.' },
  es: { title: 'Tableros de análisis', current: 'Tablero actual', close: 'Cerrar', moves: 'Jugadas', empty: 'Abre una partida de un libro: el tablero la sigue aquí, jugada a jugada.' },
  de: { title: 'Analysebretter', current: 'Aktuelles Brett', close: 'Schließen', moves: 'Züge', empty: 'Öffne eine Partie aus einem Buch: das Brett folgt ihr hier, Zug für Zug.' },
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
function CurrentGameMoves({ label, empty }: { label: string; empty: string }) {
  const tree = useStudyBoardStore((s) => s.activeGame)
  const currentId = useStudyBoardStore((s) => s.currentNodeId)
  const setCurrentNode = useStudyBoardStore((s) => s.setCurrentNode)
  const notation = useNotation()
  if (!tree) return <p className="text-sm italic text-slate-500">{empty}</p>
  const ids = shownLine(tree, currentId)
  return (
    <ol aria-label={label} className="flex flex-wrap gap-x-1 gap-y-0.5 font-mono text-sm text-slate-700">
      {ids.map((id, i) => {
        const node = tree.nodes.get(id)
        if (!node) return null
        const prefix = node.color === 'white' ? `${node.moveNumber}.` : i === 0 ? `${node.moveNumber}...` : ''
        const current = id === currentId
        return (
          <li key={id} className="inline-flex items-center gap-0.5">
            {prefix && <span className="text-slate-400">{prefix}</span>}
            <button
              type="button"
              aria-current={current ? 'true' : undefined}
              className={`rounded px-0.5 hover:bg-amber-100${current ? ' bg-amber-200 font-semibold' : ''}`}
              onClick={() => setCurrentNode(id, !tree.mainline.includes(id))}
            >
              {notation.san(node.san)}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The "Analysis board" tab (S11): the current analysis board first — the study
 * board of the reader, live, with its game's moves and all its controls — and
 * one closable tab per extra analysis board, named after its book.
 */
export default function AnalysisPage() {
  const { boards, active } = useAnalysisBoards()
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
      </div>
      <div role="tabpanel">
        {board ? (
          <div className="mx-auto w-full max-w-[520px]">
            <AnalysisBoardView key={board.id} board={board} />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,480px)_1fr]">
            <StudyBoard />
            <CurrentGameMoves label={t.moves} empty={t.empty} />
          </div>
        )}
      </div>
    </section>
  )
}

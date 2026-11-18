import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { shortScore, winPercent, numberLine, type GameNode, type GameTree, type Score } from '@chess-ebook/chess-shared'
import ChessBoardThemed from '../../../shared/chess/ChessBoard'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { lichessThemes } from '../../../shared/chess/lichessThemes'
import { reviewEngine, useReviewStore } from '../review/reviewStore'
import { uciLineToSan } from '../review/reviewEngine'
import type { EngineLine } from '../../../shared/stockfish/useEngineLines'

const T = {
  en: { engine: 'Engine', same: 'the engine’s move', lost: 'winning chances given away' },
  es: { engine: 'Motor', same: 'la jugada del motor', lost: 'probabilidad de ganar perdida' },
  de: { engine: 'Engine', same: 'der Engine-Zug', lost: 'verschenkte Gewinnchance' },
}
const HINT_DEPTH = 10
const BOARD = 220

interface Judged { before: Score; after: Score; best?: { san: string; from: string; to: string } }

const toWhite = (l: EngineLine | undefined, fen: string): Score => {
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1
  if (!l) return { cp: 0 }
  return l.mate !== undefined ? { mate: sign * l.mate } : { cp: sign * (l.scoreCp ?? 0) }
}

/** The move as the engine judged it: from the game's review, else a quick look by the engine. */
function useMoveEval(tree: GameTree, node: GameNode, enabled: boolean): Judged | null {
  const reviewed = useReviewStore((s) => s.byTree.get(tree))
  const ply = reviewed?.plies.find((p) => p.nodeId === node.id)
  const fenBefore = node.parentId ? tree.nodes.get(node.parentId)?.fen ?? tree.startFen : tree.startFen
  const [asked, setAsked] = useState<{ key: string; value: Judged } | null>(null)

  useEffect(() => {
    if (!enabled || ply) return
    let live = true
    const analyse = reviewEngine()
    void (async () => {
      const best = await analyse(fenBefore, HINT_DEPTH, 1)
      const done = new Chess(node.fen)
      const after = done.isCheckmate()
        ? { mate: node.color === 'white' ? 1 : -1 }
        : done.isGameOver() ? { cp: 0 } : toWhite((await analyse(node.fen, HINT_DEPTH, 1))[0], node.fen)
      const uci = best[0]?.pv[0]
      const san = uci ? uciLineToSan(fenBefore, [uci])[0] : undefined
      if (live) setAsked({ key: node.fen, value: { before: toWhite(best[0], fenBefore), after, ...(san && uci ? { best: { san, from: uci.slice(0, 2), to: uci.slice(2, 4) } } : {}) } })
    })()
    return () => { live = false }
  }, [enabled, ply, fenBefore, node.fen, node.color])

  if (!enabled) return null
  if (ply) {
    let best: Judged['best']
    if (ply.best) {
      try {
        const m = new Chess(ply.fenBefore).move(ply.best.san)
        best = { san: m.san, from: m.from, to: m.to }
      } catch { /* not a move of this position */ }
    }
    return { before: ply.before, after: ply.after, ...(best ? { best } : {}) }
  }
  return asked?.key === node.fen ? asked.value : null
}

const center = (sq: string) => ({ x: sq.charCodeAt(0) - 97 + 0.5, y: 8 - Number(sq[1]) + 0.5 })

/** The move the engine preferred, drawn as a dashed arrow over the thumbnail. */
function GhostArrow({ from, to }: { from: string; to: string }) {
  const a = center(from)
  const b = center(to)
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const k = (len - 0.35) / len
  return (
    <svg aria-hidden="true" viewBox="0 0 8 8" className="pointer-events-none absolute inset-0" width={BOARD} height={BOARD}>
      <defs>
        <marker id="ghost-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(5,150,105,0.85)" />
        </marker>
      </defs>
      <line
        data-testid="best-arrow" data-move={`${from}${to}`}
        x1={a.x} y1={a.y} x2={a.x + (b.x - a.x) * k} y2={a.y + (b.y - a.y) * k}
        stroke="rgba(5,150,105,0.85)" strokeWidth={0.16} strokeDasharray="0.3 0.18" strokeLinecap="round" markerEnd="url(#ghost-head)"
      />
    </svg>
  )
}

/**
 * The thumbnail shown when hovering a move: the position after it and, when
 * enabled, the engine's evaluation before → after, the winning chances the move
 * gave away, and the move the engine wanted as a dashed arrow.
 */
export function MoveTooltipCard(p: {
  tree?: GameTree; node?: GameNode; fen: string; lastMove: { from: string; to: string } | null; highlight?: string
}) {
  const lang = useSettingsStore((s) => s.language)
  const on = useSettingsStore((s) => s.hintEval)
  const t = T[lang]
  const judged = useMoveEval(p.tree ?? EMPTY_TREE, p.node ?? EMPTY_NODE, on && !!p.tree && !!p.node)
  const node = p.node
  const mover = node?.color === 'black' ? -1 : 1
  const loss = judged ? Math.max(0, Math.round(mover * (winPercent(judged.before) - winPercent(judged.after)) * 10) / 10) : 0
  const fenBefore = node && p.tree ? (node.parentId ? p.tree.nodes.get(node.parentId)?.fen : p.tree.startFen) : undefined
  const themes = node && fenBefore ? lichessThemes(fenBefore, node.san) : []
  const sameAsBest = judged?.best && node && judged.best.from === node.from && judged.best.to === node.to
  return (
    <div style={{ width: BOARD }}>
      <div className="relative" style={{ width: BOARD, height: BOARD }}>
        <ChessBoardThemed
          fen={p.fen}
          orientation="white"
          lastMove={p.lastMove}
          hideLabels
          customSquareStyles={p.highlight
            ? { [p.highlight]: { backgroundColor: 'rgba(250, 204, 21, 0.55)', boxShadow: 'inset 0 0 0 3px rgba(202, 138, 4, 0.9)' } }
            : undefined}
        />
        {judged?.best && !sameAsBest && <GhostArrow from={judged.best.from} to={judged.best.to} />}
      </div>
      {judged && node && (
        <div className="space-y-0.5 px-2 py-1 text-[11px] leading-tight text-slate-700">
          <p data-testid="hint-eval">
            <span className="font-mono">{shortScore(judged.before)} → {shortScore(judged.after)}</span>
            {loss >= 1 && <span title={t.lost} className={loss >= 20 ? 'ml-1 font-semibold text-red-700' : loss >= 10 ? 'ml-1 text-amber-700' : 'ml-1 text-slate-500'}> · Δ −{loss}%</span>}
          </p>
          {themes.length > 0 && <p data-testid="hint-themes" className="text-slate-600">🧩 {themes.join(', ')}</p>}
          {judged.best && (
            <p data-testid="hint-best" className="text-emerald-800">
              {t.engine}: {sameAsBest ? t.same : numberLine([judged.best.san], node.moveNumber, node.color)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const EMPTY_TREE = { startFen: '', nodes: new Map(), mainline: [], variations: new Map(), isolatedMoves: [], errors: [] } as unknown as GameTree
const EMPTY_NODE = { id: '', san: '', fen: '', moveNumber: 1, color: 'white' } as unknown as GameNode

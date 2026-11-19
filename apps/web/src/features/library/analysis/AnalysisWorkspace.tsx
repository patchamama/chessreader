import { useMemo, useState, type CSSProperties } from 'react'
import { Chess } from 'chess.js'
import ChessBoardThemed from '../../../shared/chess/ChessBoard'
import { NotationToggle } from '../../../shared/chess/NotationToggle'
import { playLine } from '../../../shared/chess/playLine'
import { useSettingsStore, type AppLanguage } from '../../../shared/settings/settingsStore'
import { useEngineLines } from '../../../shared/stockfish/useEngineLines'
import EvalBar from '../../viewer/components/EvalBar'
import { EngineEvalPanel } from '../components/EngineEvalPanel'
import { CUE_COLORS } from '../narration/cueStyles'
import { downloadAnnotated } from '../review/export/annotatedExport'
import { recommentGame } from '../review/recommentGame'
import { useMoveHints } from '../review/useMoveHints'
import { bracesToParagraphs, paragraphsToBraces } from '../utils/commentLayout'
import { buildBoardArrows } from '../utils/engineArrows'
import { treeToPgn } from '@chess-ebook/chess-shared'
import type { AnalysisWork } from './analysisBoards'
import { gameFromText, lineAfterMove, lineToPgn, lineTree, type AnalysisLine } from './analysisGame'
import { AnalysisMoveList } from './AnalysisMoveList'
import { START_FEN } from './analysisLine'
import { useCommentNarration } from './useCommentNarration'

const T: Record<AppLanguage, Record<string, string>> = {
  en: {
    edit: 'Edit the game text', apply: 'Apply', cancel: 'Cancel', text: 'Game text', flip: 'Flip board', hide: 'Hide board', show: 'Show board',
    comment: 'Comment the game', commenting: 'Commenting the game…', paragraphs: 'Comments as paragraphs', braces: 'Comments in braces',
    more: 'More options', pgn: 'Download PGN', pdf: 'Download PDF', moves: 'Moves', first: 'First position', prev: 'Previous move', next: 'Next move',
    last: 'Last move', narrate: 'Narrate', stop: 'Stop narrating', invalid: 'No game or position found in the text.', reset: 'New game',
    placeholder: 'Type or paste a game: PGN or a book\'s text. A FEN on its own line sets the starting position.',
    free: 'Move the pieces to play: the moves are listed here, coloured by how good they are.',
  },
  es: {
    edit: 'Editar el texto de la partida', apply: 'Aplicar', cancel: 'Cancelar', text: 'Texto de la partida', flip: 'Girar el tablero', hide: 'Ocultar el tablero', show: 'Mostrar el tablero',
    comment: 'Comentar la partida', commenting: 'Comentando la partida…', paragraphs: 'Comentarios en párrafos', braces: 'Comentarios entre llaves',
    more: 'Más opciones', pgn: 'Descargar PGN', pdf: 'Descargar PDF', moves: 'Jugadas', first: 'Posición inicial', prev: 'Jugada anterior', next: 'Siguiente jugada',
    last: 'Última jugada', narrate: 'Narrar', stop: 'Detener la narración', invalid: 'No se encontró ninguna partida ni posición en el texto.', reset: 'Partida nueva',
    placeholder: 'Escribe o pega una partida: PGN o el texto de un libro. Un FEN en su propia línea fija la posición inicial.',
    free: 'Mueve las piezas para jugar: las jugadas aparecen aquí, coloreadas según lo buenas que son.',
  },
  de: {
    edit: 'Partietext bearbeiten', apply: 'Übernehmen', cancel: 'Abbrechen', text: 'Partietext', flip: 'Brett drehen', hide: 'Brett ausblenden', show: 'Brett einblenden',
    comment: 'Partie kommentieren', commenting: 'Partie wird kommentiert…', paragraphs: 'Kommentare als Absätze', braces: 'Kommentare in Klammern',
    more: 'Weitere Optionen', pgn: 'PGN herunterladen', pdf: 'PDF herunterladen', moves: 'Züge', first: 'Ausgangsstellung', prev: 'Vorheriger Zug', next: 'Nächster Zug',
    last: 'Letzter Zug', narrate: 'Vorlesen', stop: 'Vorlesen beenden', invalid: 'Im Text wurde keine Partie und keine Stellung gefunden.', reset: 'Neue Partie',
    placeholder: 'Partie eingeben oder einfügen: PGN oder Buchtext. Ein FEN in einer eigenen Zeile legt die Ausgangsstellung fest.',
    free: 'Ziehe die Figuren, um zu spielen: die Züge erscheinen hier, gefärbt nach ihrer Qualität.',
  },
}

/** An empty board: the start position, nothing played or typed. */
export const EMPTY_WORK: AnalysisWork = { startFen: START_FEN, moves: [], ply: 0, text: '', flipped: false, boardHidden: false, layout: 'paragraphs' }

function saveFile(name: string, data: string, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileName = (title: string) => title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'analysis'

/**
 * A board of the analysis tab that works like a game opened in a book: play
 * moves freely (each listed beside the board, coloured by how good it is), or
 * type / paste a game (PGN or a book's text, a FEN line for its position) and
 * apply it; flip or hide the board, comment the game with the engine, write the
 * comments as paragraphs or in braces, download it (PGN, PDF), with the eval
 * bar, the engine lines and the narration of a book's comment.
 *
 * Controlled: everything done here is handed to `onChange`, so the tab keeps it.
 */
export function AnalysisWorkspace({ title, work, onChange, comment, source }: {
  title: string
  work: AnalysisWork
  onChange: (work: AnalysisWork) => void
  /** A book's comment the board was opened with (narrated on this board). */
  comment?: string
  source?: string
}) {
  const lang = useSettingsStore((s) => s.language)
  const showEval = useSettingsStore((s) => s.showEval)
  const showEngineArrow = useSettingsStore((s) => s.showEngineArrow)
  const moveHintsOn = useSettingsStore((s) => s.moveHints)
  const t = T[lang] ?? T.en

  const line: AnalysisLine = useMemo(() => ({ startFen: work.startFen, moves: work.moves }), [work.startFen, work.moves])
  const tree = useMemo(() => lineTree(line), [line])
  const { positions } = useMemo(() => playLine(line.startFen, line.moves), [line])
  const total = positions.length
  const ply = Math.max(0, Math.min(work.ply, total))
  const currentId = ply > 0 ? tree.mainline[ply - 1] : null

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<{ square: string; targets: string[] } | null>(null)

  const set = (patch: Partial<AnalysisWork>) => onChange({ ...work, ...patch })
  const narration = useCommentNarration({ text: comment ?? '', lang, startFen: line.startFen, positions, ply, setPly: (p) => set({ ply: p }) })
  const go = (n: number) => { narration.clearView(); setSelected(null); set({ ply: Math.max(0, Math.min(total, n)) }) }

  const shown = ply > 0 ? positions[ply - 1] : null
  const fen = narration.view?.fen ?? shown?.fen ?? line.startFen
  const lastMove = narration.view ? narration.view.lastMove : shown ? { from: shown.from, to: shown.to } : null

  const engine = useEngineLines(fen)
  const best = engine.lines[0]
  const evalScore = showEval && best ? { scoreCp: best.scoreCp, mate: best.mate, loading: engine.loading } : null
  const hints = useMoveHints(fen, selected?.square ?? null, moveHintsOn && !narration.view)

  const play = (from: string, to: string): boolean => {
    const next = lineAfterMove(line, ply, from, to)
    setSelected(null)
    if (!next) return false
    narration.clearView()
    onChange({ ...work, ...next, ply: ply + 1 })
    return true
  }

  const onSquareClick = (square: string) => {
    if (selected?.targets.includes(square)) { play(selected.square, square); return }
    if (selected?.square === square) { setSelected(null); return }
    let targets: string[] = []
    try { targets = new Chess(fen).moves({ square: square as never, verbose: true }).map((m) => m.to) } catch { /* not a position */ }
    setSelected(targets.length ? { square, targets } : null)
  }

  const apply = () => {
    const game = gameFromText(draft)
    if (!game) { setInvalid(true); return }
    setInvalid(false)
    setEditing(false)
    onChange({ ...work, ...game, ply: game.moves.length, text: draft.trim() })
  }

  const commentGame = async () => {
    const movetext = treeToPgn(tree)
    const game = { charStart: 0, charEnd: movetext.length, source: movetext, tree }
    setBusy(true)
    try {
      const commented = await recommentGame([game], 0, movetext)
      const text = line.startFen === START_FEN ? commented : `${line.startFen}\n${commented}`
      onChange({ ...work, text: work.layout === 'braces' ? paragraphsToBraces(text) : text })
    } finally {
      setBusy(false)
    }
  }

  const toggleLayout = () => {
    const layout = work.layout === 'paragraphs' ? 'braces' : 'paragraphs'
    const text = work.text ? (layout === 'braces' ? paragraphsToBraces(work.text) : bracesToParagraphs(work.text)) : ''
    set({ layout, text })
  }

  const textToSave = () => work.text || `${line.startFen === START_FEN ? '' : `${line.startFen}\n`}${treeToPgn(tree)}`

  const squareStyles: Record<string, CSSProperties> = { ...(narration.view?.squareStyles ?? {}) }
  for (const [square, hint] of Object.entries(hints)) {
    const color = CUE_COLORS[hint]
    squareStyles[square] = { ...squareStyles[square], background: `radial-gradient(circle, ${color} 0 32%, transparent 34%)`, boxShadow: `inset 0 0 0 3px ${color}` }
  }
  const arrows = narration.view
    ? narration.view.arrows
    : buildBoardArrows({ userArrows: [], showEval, showEngineArrow, bestMoveUci: engine.bestMove, nextMove: null })

  const sideToMove = line.startFen.split(' ')[1] === 'b' ? 'black' : 'white'
  const orientation = work.flipped ? (sideToMove === 'white' ? 'black' : 'white') : sideToMove
  const button = 'rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  const on = (active: boolean) => `${button}${active ? ' border-emerald-500 bg-emerald-50' : ''}`

  return (
    <div className="flex flex-col gap-3" data-testid="analysis-board">
      <div role="toolbar" aria-label={title} className="flex flex-wrap items-center gap-1">
        {editing ? (
          <>
            <button type="button" className={`${button} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`} onClick={apply}>{t.apply}</button>
            <button type="button" className={button} onClick={() => { setEditing(false); setInvalid(false) }}>{t.cancel}</button>
          </>
        ) : (
          <button type="button" className={button} aria-label={t.edit} title={t.edit} onClick={() => { setDraft(textToSave()); setEditing(true) }}>✎</button>
        )}
        <button type="button" className={on(work.flipped)} aria-label={t.flip} title={t.flip} onClick={() => set({ flipped: !work.flipped })}>⇅</button>
        <button type="button" className={on(work.boardHidden)} aria-label={work.boardHidden ? t.show : t.hide} title={work.boardHidden ? t.show : t.hide} onClick={() => set({ boardHidden: !work.boardHidden })}>▦</button>
        <button type="button" className={button} aria-label={t.comment} title={t.comment} disabled={busy || total === 0} onClick={() => void commentGame()}>💬</button>
        <button
          type="button" className={button}
          aria-label={work.layout === 'paragraphs' ? t.braces : t.paragraphs} title={work.layout === 'paragraphs' ? t.braces : t.paragraphs}
          onClick={toggleLayout}
        >
          {work.layout === 'paragraphs' ? '{ }' : '¶'}
        </button>
        <NotationToggle className={button} />
        <button type="button" className={button} aria-label={t.reset} title={t.reset} onClick={() => { narration.clearView(); onChange({ ...EMPTY_WORK, flipped: work.flipped, boardHidden: work.boardHidden, layout: work.layout }) }}>↺</button>
        <div className="relative">
          <button type="button" className={button} aria-label={t.more} title={t.more} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>⋯</button>
          {menuOpen && (
            <div role="menu" aria-label={t.more} className="absolute right-0 z-20 mt-1 flex min-w-[10rem] flex-col rounded border border-slate-200 bg-white py-1 text-sm shadow-lg">
              <button type="button" role="menuitem" className="px-3 py-1 text-left hover:bg-slate-50" onClick={() => { setMenuOpen(false); saveFile(`${fileName(title)}.pgn`, lineToPgn(line, { Event: title }), 'application/x-chess-pgn') }}>{t.pgn}</button>
              <button type="button" role="menuitem" className="px-3 py-1 text-left hover:bg-slate-50" onClick={() => { setMenuOpen(false); downloadAnnotated(`# ${title}\n\n${textToSave()}`, 'pdf', fileName(title), lang) }}>{t.pdf}</button>
            </div>
          )}
        </div>
        {busy && <span role="status" className="text-xs italic text-slate-500">{t.commenting}</span>}
      </div>

      <div className={work.boardHidden ? 'flex flex-col gap-3' : 'grid items-start gap-4 md:grid-cols-[minmax(0,420px)_1fr]'}>
        {!work.boardHidden && (
          <div className="flex flex-col gap-2">
            <div className="flex items-stretch gap-1">
              {showEval && <EvalBar fen={fen} direction="vertical" score={evalScore} />}
              <div className="flex-1">
                <ChessBoardThemed
                  fen={fen} orientation={orientation} lastMove={lastMove} arrows={arrows}
                  customSquareStyles={squareStyles}
                  onSquareClick={onSquareClick}
                  allowDragging
                  onPieceDrop={play}
                  selectedSquare={selected?.square ?? null}
                  legalTargets={selected?.targets ?? []}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button type="button" className={button} aria-label={t.first} disabled={ply === 0} onClick={() => go(0)}>⏮</button>
              <button type="button" className={button} aria-label={t.prev} disabled={ply === 0} onClick={() => go(ply - 1)}>◀</button>
              <button type="button" className={button} aria-label={t.next} disabled={ply >= total} onClick={() => go(ply + 1)}>▶</button>
              <button type="button" className={button} aria-label={t.last} disabled={ply >= total} onClick={() => go(total)}>⏭</button>
            </div>
            {showEval && <EngineEvalPanel fen={fen} engine={engine} onPlayUci={(uci) => { play(uci.slice(0, 2), uci.slice(2, 4)) }} />}
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-3 self-start">
          {editing ? (
            <>
              <textarea
                aria-label={t.text}
                value={draft}
                placeholder={t.placeholder}
                onChange={(e) => { setDraft(e.target.value); setInvalid(false) }}
                rows={14}
                className="w-full rounded border border-slate-300 p-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
              />
              {invalid && <p role="alert" className="text-sm text-red-700">{t.invalid}</p>}
            </>
          ) : (
            <>
              {total > 0
                ? <AnalysisMoveList label={t.moves} tree={tree} ids={tree.mainline} currentId={currentId} onSelect={(id) => go(tree.mainline.indexOf(id) + 1)} />
                : <p className="text-sm italic text-slate-500">{t.free}</p>}
              {work.text && <p data-testid="analysis-text" className="whitespace-pre-line rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">{work.text}</p>}
            </>
          )}
          {comment && (
            <div className="rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">
              <p className="whitespace-pre-line">{comment}</p>
              {source && <p className="mt-1 text-xs italic text-slate-500">{source}</p>}
              <div className="mt-2">
                {narration.narrating
                  ? <button type="button" className={button} aria-label={t.stop} onClick={narration.stop}>⏹ {t.stop}</button>
                  : <button type="button" className={button} aria-label={t.narrate} onClick={() => void narration.narrate()}>🔊 {t.narrate}</button>}
              </div>
            </div>
          )}
          {!comment && source && <p className="text-xs italic text-slate-500">{source}</p>}
        </div>
      </div>
    </div>
  )
}

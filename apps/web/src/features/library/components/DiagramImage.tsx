import { useCallback, useEffect, useState } from 'react'
import {
  useSettingsStore,
  BOARD_THEMES,
  PIECE_THEMES,
  type BoardTheme,
  type PieceTheme,
} from '../../../shared/settings/settingsStore'
import { regenerateDiagram } from '../../../shared/chess/diagramApi'
import { formatDiagramEvalFooter, type DiagramEval } from '../../../shared/chess/diagramEvalFooter'
import { useDiagramEvalStore } from '../diagramEval/diagramEvalStore'
import { DiagramEvalFooter, RefreshIcon } from '../diagramEval/DiagramEvalFooter'
import type { MoveBefore } from '../utils/inferDiagramFen'
import { BOOK_STYLE_LABEL, generatedDiagramSvg, useDiagramStyleStore, type DiagramStyle } from '../utils/boardSvg'
import { FenHint } from './FenHint'

/** The value of the book style in the board theme menu. */
const BOOK_OPTION = 'book'

interface Props {
  src: string
  alt: string
  /** Position inferred from the preceding mainline (or initial position). */
  fen: string
  /** Show the engine's evaluation under the diagram (book diagrams; a commented game writes its own). */
  withEval?: boolean
  /** The FEN line the text prints next to this diagram (hidden from the prose): shown on demand. */
  textFen?: string
  /**
   * The position is really known (data-fen, the text's FEN line, or a move
   * recognised before the image — see diagramFenOf): when the image cannot be
   * loaded, a regenerated diagram is shown instead (S8).
   */
  fenKnown?: boolean
  /** The last main-line move before the diagram, and a variation move just before it (S14). */
  mainBefore?: MoveBefore | null
  variationBefore?: MoveBefore | null
}

/**
 * A book diagram image that can be regenerated from its FEN with a small
 * refresh icon just above its top-right corner. The generated board is drawn in
 * the browser in the book style (the default), or by the backend in the chosen
 * board theme, with a small Stockfish evaluation footer. Right-clicking the
 * generated board opens a config menu (style / piece set / coordinates) and a
 * FEN editor. A missing image whose position is known is regenerated at once.
 */
export function DiagramImage({ src, alt, fen, withEval = false, textFen, fenKnown = false, mainBefore = null, variationBefore = null }: Props) {
  const boardTheme = useSettingsStore((s) => s.diagramBoardTheme)
  const pieceTheme = useSettingsStore((s) => s.diagramPieceTheme)
  const coordinates = useSettingsStore((s) => s.diagramCoordinates)
  const setSetting = useSettingsStore((s) => s.set)
  const evalShown = useSettingsStore((s) => s.diagramEvalShow) && withEval
  const style = useDiagramStyleStore((s) => s.style)
  const setStyle = useDiagramStyleStore((s) => s.setStyle)

  const [mode, setMode] = useState<'original' | 'generated'>('original')
  const [svg, setSvg] = useState<string | null>(null)
  const [evalData, setEvalData] = useState<DiagramEval | null>(null)
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingFen, setEditingFen] = useState(false)
  const [activeFen, setActiveFen] = useState(fen)
  const hasBookEval = useDiagramEvalStore((s) => !!s.get(activeFen))
  const [fenDraft, setFenDraft] = useState(fen)

  const regenerate = useCallback(
    async (overrideFen?: string) => {
      const useFen = overrideFen ?? activeFen
      if (style === 'book') {
        // Drawn in the browser: instant, offline, no server needed.
        setSvg(generatedDiagramSvg(useFen))
        setEvalData(null)
        return
      }
      setLoading(true)
      try {
        const theme = BOARD_THEMES[boardTheme]
        const res = await regenerateDiagram({
          fen: useFen,
          lightColor: theme.light,
          darkColor: theme.dark,
          pieceSet: pieceTheme === 'default' ? 'merida' : pieceTheme,
          coordinates,
        })
        setSvg(res.svg)
        setEvalData(res.eval)
      } catch {
        // The server could not draw it: the browser draws the same position.
        setSvg(generatedDiagramSvg(useFen))
        setEvalData(null)
      } finally {
        setLoading(false)
      }
    },
    [activeFen, boardTheme, pieceTheme, coordinates, style],
  )

  // Whenever the board config changes while showing the generated board, refresh.
  useEffect(() => {
    if (mode !== 'generated') return
    regenerate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, boardTheme, pieceTheme, coordinates, activeFen, style])

  /** The refresh icon: show the generated board, or draw it again when shown. */
  const onRefresh = () => {
    if (mode === 'generated') void regenerate()
    else setMode('generated')
  }
  /** A missing image (404, broken) whose position is known: regenerate it (S8). */
  const onImageError = () => {
    if (fenKnown) setMode('generated')
  }
  const showOriginal = () => {
    setMode('original')
    setMenuOpen(false)
    setEditingFen(false)
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuOpen(true)
  }

  const applyFen = () => {
    setActiveFen(fenDraft)
    setEditingFen(false)
  }

  return (
    <span className="diagram-image relative mt-5 inline-block" data-diagram-src={src} data-diagram-fen={activeFen}>
      {textFen && <FenHint fen={textFen} />}
      {/* Small icons just above the top-right corner: they never cover the board. */}
      <button
        type="button"
        onClick={onRefresh}
        aria-label="Regenerate diagram"
        title="Regenerate diagram"
        aria-busy={loading || undefined}
        className="absolute bottom-full right-0 z-10 mb-0.5 flex h-4 w-4 items-center justify-center rounded text-slate-400 transition hover:text-slate-800"
      >
        <RefreshIcon spinning={loading} />
      </button>
      {mode === 'generated' && (
        <button
          type="button"
          onClick={showOriginal}
          aria-label="Show original image"
          title="Show original image"
          className="absolute bottom-full right-5 z-10 mb-0.5 flex h-4 w-4 items-center justify-center rounded text-slate-400 transition hover:text-slate-800"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </button>
      )}

      {mode === 'original' ? (
        <img src={src} alt={alt} className="max-w-full h-auto" onError={onImageError} />
      ) : (
        <span className="inline-block">
          <span
            data-testid="diagram-generated"
            role="img"
            aria-label={`${alt} (generated)`}
            onContextMenu={onContextMenu}
            className="block"
            dangerouslySetInnerHTML={{ __html: svg ?? '' }}
          />
          {loading && <span role="status" className="block text-[10px] text-slate-400">Generating…</span>}
          {evalData && !(evalShown && hasBookEval) && (
            <span className="block font-mono text-[10px] leading-tight text-slate-500">
              {formatDiagramEvalFooter(evalData, activeFen)}
            </span>
          )}

          {menuOpen && (
            <DiagramConfigMenu
              style={style}
              onStyle={setStyle}
              boardTheme={boardTheme}
              pieceTheme={pieceTheme}
              coordinates={coordinates}
              onBoardTheme={(v) => setSetting({ diagramBoardTheme: v })}
              onPieceTheme={(v) => setSetting({ diagramPieceTheme: v })}
              onCoordinates={(v) => setSetting({ diagramCoordinates: v })}
              onEditFen={() => {
                setFenDraft(activeFen)
                setEditingFen(true)
              }}
              onClose={() => setMenuOpen(false)}
            />
          )}

          {editingFen && (
            <span className="mt-1 flex items-center gap-1">
              <label className="text-[10px] text-slate-500" htmlFor="diagram-fen-input">
                FEN
              </label>
              <input
                id="diagram-fen-input"
                value={fenDraft}
                onChange={(e) => setFenDraft(e.target.value)}
                className="w-64 rounded border border-slate-300 px-1 py-0.5 font-mono text-[10px]"
              />
              <button
                type="button"
                onClick={applyFen}
                className="rounded border border-emerald-500 px-1.5 text-[10px] text-emerald-600 hover:bg-emerald-50"
              >
                Apply FEN
              </button>
            </span>
          )}
        </span>
      )}
      {evalShown && <DiagramEvalFooter key={activeFen} fen={activeFen} main={mainBefore} variation={variationBefore} />}
    </span>
  )
}

interface MenuProps {
  style: DiagramStyle
  onStyle: (v: DiagramStyle) => void
  boardTheme: BoardTheme
  pieceTheme: PieceTheme
  coordinates: boolean
  onBoardTheme: (v: BoardTheme) => void
  onPieceTheme: (v: PieceTheme) => void
  onCoordinates: (v: boolean) => void
  onEditFen: () => void
  onClose: () => void
}

function DiagramConfigMenu({
  style,
  onStyle,
  boardTheme,
  pieceTheme,
  coordinates,
  onBoardTheme,
  onPieceTheme,
  onCoordinates,
  onEditFen,
  onClose,
}: MenuProps) {
  return (
    <span
      role="menu"
      aria-label="Diagram settings"
      className="absolute z-20 mt-1 flex flex-col gap-1.5 rounded-md border border-slate-200 bg-white p-2 text-[11px] shadow-lg"
    >
      <label className="flex items-center justify-between gap-2">
        <span>Board theme</span>
        <select
          aria-label="Board theme"
          value={style === 'book' ? BOOK_OPTION : boardTheme}
          onChange={(e) => {
            if (e.target.value === BOOK_OPTION) return onStyle('book')
            onStyle('theme')
            onBoardTheme(e.target.value as BoardTheme)
          }}
          className="rounded border border-slate-300 px-1"
        >
          <option value={BOOK_OPTION}>{BOOK_STYLE_LABEL}</option>
          {Object.entries(BOARD_THEMES).map(([key, t]) => (
            <option key={key} value={key}>{t.label}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center justify-between gap-2">
        <span>Piece set</span>
        <select
          aria-label="Piece set"
          value={pieceTheme}
          onChange={(e) => onPieceTheme(e.target.value as PieceTheme)}
          className="rounded border border-slate-300 px-1"
        >
          {Object.entries(PIECE_THEMES).map(([key, t]) => (
            <option key={key} value={key}>{t.label}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center justify-between gap-2">
        <span>Coordinate symbols</span>
        <input
          type="checkbox"
          aria-label="Coordinate symbols"
          checked={coordinates}
          onChange={(e) => onCoordinates(e.target.checked)}
        />
      </label>

      <span className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onEditFen}
          className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-50"
        >
          Edit FEN
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 py-0.5 text-slate-400 hover:text-slate-700"
        >
          Close
        </button>
      </span>
    </span>
  )
}

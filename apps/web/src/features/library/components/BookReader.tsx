import { useMemo, useEffect, useLayoutEffect, useState, useCallback, useRef, memo, forwardRef } from 'react'
import { diagramFenOf } from '../utils/diagramFiles'
import { DiagramToolsPanel } from './DiagramToolsPanel'
import { formatChapterTitle, prepareChapterHtml } from '../utils/epubContent'
import { useParams } from 'react-router-dom'
import { useBookTitle, useChapter, useTouchBook, type Book } from '../api/libraryApi'
import { useQueryClient } from '@tanstack/react-query'
import { findProseReferences, numberLine, PROSE_REVEAL_STEP_MS, recognizeGames, unanchoredMoves } from '@chess-ebook/chess-shared'
import type { GameTree, GameNode, IsolatedMove, ProseReference } from '@chess-ebook/chess-shared'
import { MoveTooltipCard } from './MoveTooltipCard'
import { loadBoardMemory, saveBoardMemory } from '../store/boardMemory'
import { dashedPair, squareLine } from '../utils/squareLine'
import { positionBefore, prefersReducedMotion, referenceMark } from '../utils/proseReferences'
import { applyGameLayouts, clearGameDecorations, decorateGames, describeGames, gameAnchorId, layoutToggleLabel } from '../utils/gameMarkers'
import { detectHeadings } from '../utils/headingDetect'
import { clearGameLayout, loadGameLayouts, saveGameLayout } from '../store/gameLayoutStore'
import { rewriteKey, useGameRewriteStore } from '../store/gameRewriteStore'
import { useReaderViewStore } from '../store/readerViewStore'
import BookRemarkPanel from './BookRemarkPanel'
import { mentionOrigins } from '../utils/mentionOrigin'
import { applyGameRewrites, cycleBookComment, setBookComment, pickBookComments, unwrapGameContainers, wrapGameContainers } from '../utils/gameRewrite'
import { recommentGame } from '../review/recommentGame'
import { nextPaint, withBusy, withProgress } from '../../../shared/layout/busyStore'
import { captureOffset, captureTopAnchor, restoreOffset, restoreTopAnchor, type ScrollAnchor } from '../../../shared/layout/scrollAnchor'
import { flashElement } from '../../../shared/layout/flash'
import { BookCommentsToggle, StudyTools } from './ReaderToolbar'
import { WidthControl } from './WidthControl'
import { TextZoom } from './TextZoom'
import { useTextZoom } from '../hooks/useTextZoom'
import { ReaderToc } from './toc/ReaderToc'
import { StudyBoard } from './StudyBoard'
import { StudyPanelResizer } from './StudyPanelResizer'
import { VariationChooser } from './VariationChooser'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { revealStudyBoard } from '../utils/revealStudyBoard'
import { TranslateChapterButton } from '../translate/TranslateChapterButton'
import { useLibraryBook } from '../translate/useLibraryBook'
import { getProgress, saveProgress, getChapterScroll, saveChapterScroll } from '../store/readingStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { successorOf, hasAlternativesAhead, variationLinesFrom } from '../utils/proseChess'
import { useBookConfig } from '../../../shared/bookConfig/useBookConfig'
import { buildBookConfigCss } from '../utils/bookConfigCss'
import { isMoveLine } from '../utils/isMoveLine'
import { BookConfigEditor } from './BookConfigEditor'
import { useAuthStore } from '../../auth/store/authStore'
import { RecognitionErrorPanel, type FlatError } from './RecognitionErrorPanel'
import { RecognitionDebugPanel } from './RecognitionDebugPanel'
import { isDevMode } from '../../../shared/env/devMode'
import { createRoot, type Root } from 'react-dom/client'
import { DiagramImage } from './DiagramImage'
import { INITIAL_FEN, movesBeforeImage } from '../utils/inferDiagramFen'
import { useSessionFenStore, withSessionFens } from '../imageAi/sessionFens'
import { usePendingSuggestions, withPendingSuggestions } from '../../suggestions/pendingSuggestions'
import { EditLayer } from '../edit/EditLayer'
import { EditModeButton, PENDING_SUGGESTION_CSS } from '../edit/EditModeButton'
import { followActiveMove } from '../utils/autoscroll'
import { NarrationPanel } from '../narration/NarrationPanel'
import { GameReviewPanel } from '../review/GameReviewPanel'
import { DiagramEvalPanel } from '../diagramEval/DiagramEvalPanel'
import { PositionIdeasPanel } from '../review/PositionIdeasPanel'
import { ProblemPanel } from '../problem/ProblemPanel'
import { useProblemStore } from '../problem/problemStore'
import { TrackPlayer } from '../track/TrackPlayer'
import { demoTrackFor } from '../../../demo/demoTracks'
import { CorrectionWorkbench } from '../correction/CorrectionWorkbench'
import { paintUnplacedMoves } from '../utils/unplacedMoves'
import { extractProseText, htmlToProseText, planMoveTargets, piecesByTextNode, nodeBeforeOffset } from '../utils/proseText'
import { playLine } from '../../../shared/chess/playLine'
import { formatMoveSpans } from '../../../shared/chess/notation'
import { openAnalysisBoard } from '../analysis/analysisBoards'
import { CommentSourceMenu, type CommentSourceTarget } from './CommentSourceMenu'
import { EvalColoringButtons } from './EvalColoringButtons'
import { qualitiesOf, useEvalColoringStore } from '../store/evalColoringStore'
import { paintMoveQualities } from '../utils/moveQualityPaint'
import { loadChapterGames } from '../review/chapterGames'

// The reading pane's innerHTML is set ONCE per chapter and then mutated
// imperatively (SAN spans, highlight classes) by effects. If React re-rendered
// this div on every parent state change (click, hover tooltip, variation
// chooser), its dangerouslySetInnerHTML commit would RESET the innerHTML to the
// raw `html` string — wiping every span and class we injected, which killed all
// highlights and interactions. memo() on `html` keeps React's hands off the
// subtree: it only re-commits when the chapter content actually changes.
const ProseContent = memo(
  forwardRef<HTMLDivElement, { html: string }>(function ProseContent({ html }, ref) {
    return (
      <div
        ref={ref}
        className="epub-content max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }),
)

/** Unmount overlay roots after the current render (React refuses to unmount a root while rendering). */
function unmountLater(roots: Root[]) {
  if (roots.length) setTimeout(() => roots.forEach((r) => r.unmount()), 0)
}

/** The blocks of the text that can hold the first visible line (S10). */
const ANCHOR_BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, table, [data-game-marker], [data-diagram-overlay]'

/** Whether the desktop table-of-contents panel is open (kept per browser). */
const TOC_OPEN_KEY = 'reader-toc-open'

interface ProseChooser {
  top: number
  left: number
  tree: GameTree
  successorId: string
  siblingLines: string[][]
}

/** A prose reference with the position the text talks about (none: the board as it is). */
interface RefEntry { ref: ProseReference; tree: GameTree | null; node: GameNode | null }

interface MoveTooltip {
  top: number
  left: number
  fen: string
  lastMove: { from: string; to: string } | null
  /** A square to mark on the thumbnail (a square the text names). */
  highlight?: string
  /** A line of squares the text names ("the diagonal a2-g8"). */
  line?: string[]
  /** A plan the text names ("d4-d5"), as an arrow. */
  arrow?: [string, string]
  /** More arrows the text names (a plan list, a pawn advance). */
  arrows?: [string, string][]
  /** Squares to light one after another on the thumbnail (a flank's pawns). */
  sequence?: string[]
  /** Squares of the pieces a bare piece move means, in another colour. */
  from?: string[]
  /** What is hovered: a move of the game, a move of a line in a comment, or a named square. */
  kind?: 'move' | 'line' | 'square'
  /** The hovered move, to show the engine's view of it. */
  move?: { tree: GameTree; node: GameNode }
}

/** The board marks of a square, line or plan named in the text ("a2-g8", "d4-d5", "e4"). */
/**
 * The "game" of a move written in a fragment no game holds (no position to start
 * from, S3): no moves, so a mark of it only lights its square on the board.
 */
const NO_GAME_TREE = { startFen: '', nodes: new Map(), mainline: [], variations: new Map(), isolatedMoves: [], errors: [], unplacedVariationMoves: [] } as unknown as GameTree
const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1'

/** The position the study board shows now (a fragment without a position is read against it). */
function shownBoardFen(): string {
  const s = useStudyBoardStore.getState()
  if (s.playFen) return s.playFen
  const tree = s.activeGame
  if (!tree) return EMPTY_BOARD_FEN
  return (s.currentNodeId ? tree.nodes.get(s.currentNodeId)?.fen : undefined) ?? tree.startFen ?? EMPTY_BOARD_FEN
}

/** The board marks of a square named in the text; on `fen`, the piece that reaches it is located and an arrow drawn from it. */
function mentionMark(iso: IsolatedMove, fen?: string | null) {
  const pair = dashedPair(iso.rawSan ?? '')
  const line = pair ? squareLine(pair.from, pair.to) : null
  const from = !pair && fen ? mentionOrigins(fen, iso.piece, iso.square) : []
  return {
    square: iso.square, piece: iso.piece,
    ...(from.length ? { from, arrows: from.map((f): [string, string] => [f, iso.square]) } : {}),
    ...(line && line.length > 2 ? { line } : {}),
    ...(pair && !(line && line.length > 2) ? { arrow: [pair.from, pair.to] as [string, string] } : {}),
  }
}

/** A line of moves written in a comment (markup contract: span.chess-line / button.line-to-board). */
function lineOf(el: HTMLElement): { startFen: string; moves: string[]; title: string } | null {
  const startFen = el.dataset.lineStart
  const moves = (el.dataset.lineMoves ?? '').split(/\s+/).filter(Boolean)
  if (!startFen || moves.length === 0) return null
  const [, turn, , , , number] = startFen.split(' ')
  return { startFen, moves, title: numberLine(moves, Number(number) || 1, turn === 'b' ? 'black' : 'white') }
}

interface ResolvedNode {
  tree: GameTree
  node: GameNode
  gameIndex: number
}

export default function BookReader({ bookId: bookIdProp }: { bookId?: number } = {}) {
  const { bookId } = useParams<{ bookId: string }>()
  const id = bookIdProp ?? Number(bookId)

  const [currentChapter, setCurrentChapter] = useState<number>(() => {
    const p = getProgress(id)
    return p?.chapter ?? 1
  })
  // The table of contents: a left panel always shown on desktop unless collapsed,
  // a drawer on small screens. It stays open while navigating (S13).
  const [showToc, setShowToc] = useState(() => {
    try {
      if (!window.matchMedia?.('(min-width: 1024px)').matches) return false
      return localStorage.getItem(TOC_OPEN_KEY) !== 'false'
    } catch {
      return false
    }
  })
  const toggleToc = () => setShowToc((v) => {
    try {
      if (window.matchMedia?.('(min-width: 1024px)').matches) localStorage.setItem(TOC_OPEN_KEY, String(!v))
    } catch { /* not kept */ }
    return !v
  })
  const [showStudy, setShowStudy] = useState(true)
  const [chooser, setChooser] = useState<ProseChooser | null>(null)
  const [tooltip, setTooltip] = useState<MoveTooltip | null>(null)
  const [sourceMenu, setSourceMenu] = useState<CommentSourceTarget | null>(null)
  const [remarkPanel, setRemarkPanel] = useState<{ fen: string; quote: Element } | null>(null)
  const setRemarkPanelRef = useRef(setRemarkPanel)
  const setSourceMenuRef = useRef(setSourceMenu)
  const closeSourceMenu = useCallback(() => setSourceMenu(null), [])
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stable ref so the wrapping effect can call setTooltip without being in deps.
  const setTooltipRef = useRef(setTooltip)

  const loadStudyPosition = useStudyBoardStore((s) => s.loadPosition)
  const setIsolatedHighlight = useStudyBoardStore((s) => s.setIsolatedHighlight)
  const autoscroll = useSettingsStore((s) => s.autoscroll)
  const epub = useSettingsStore((s) => s.epub)
  const studyPanelWidth = useSettingsStore((s) => s.studyPanelWidth)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const textZoom = useTextZoom()
  const notationLang = useSettingsStore((s) => s.language)
  const notationStyle = useSettingsStore((s) => s.notationStyle)
  const { config: bookConfig } = useBookConfig(id)
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  // The recognition debug tooling shows for admins OR in any developer context
  // (Vite dev build / localhost), so you can use it without an admin login.
  const showDebugTools = isAdmin || isDevMode()
  const [showBookConfig, setShowBookConfig] = useState(false)

  const { data, isLoading } = useChapter(id, currentChapter)
  const bookTitle = useBookTitle(id)
  const libraryBook = useLibraryBook(id)
  const touchBook = useTouchBook()
  const contentRef = useRef<HTMLDivElement>(null)

  const toc = data?.toc ?? []
  const maxChapter = toc.length > 0 ? Math.max(...toc.map((e) => e.order)) : 1

  useEffect(() => {
    if (id > 0) touchBook.mutate(id) // the in-memory external book has nothing to touch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Another book in the same reader (the route changed, the component stayed):
  // its own chapter, not the previous book's (S8: a regenerated game was blank).
  const [shownBook, setShownBook] = useState(id)
  if (shownBook !== id) {
    setShownBook(id)
    setCurrentChapter(getProgress(id)?.chapter ?? 1)
  }

  useEffect(() => {
    if (shownBook === id) saveProgress(id, currentChapter)
  }, [id, currentChapter, shownBook])

  // The scroll position is restored per chapter once its content is shown (S12).
  const goTo = useCallback((n: number) => {
    setCurrentChapter(n)
  }, [])

  const loadStudyNode = useCallback(
    (tree: GameTree, node: GameNode) => {
      useStudyBoardStore.getState().commitPreview()
      loadStudyPosition(tree, node.id, !tree.mainline.includes(node.id))
      setShowStudy(true)
      // Bring the board into view: the pane back to its top, the page if the board is off screen (S10).
      revealStudyBoard()
    },
    [loadStudyPosition],
  )

  // Navigate the prose to the move that triggered a recognition error. Find the
  // first text occurrence of its written notation and scroll/flash it.
  const navigateToError = useCallback((err: FlatError) => {
    const container = contentRef.current
    if (!container) return
    setShowErrors(false)
    const needle = err.rawSan ?? err.san
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const idx = (node.nodeValue ?? '').indexOf(needle)
      if (idx >= 0) {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + needle.length)
        const rect = range.getBoundingClientRect()
        const el = (node.parentElement ?? container)
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Brief highlight flash on the surrounding element.
        const prev = el.style.backgroundColor
        el.style.transition = 'background-color 0.4s'
        el.style.backgroundColor = 'rgba(251, 191, 36, 0.5)'
        window.setTimeout(() => { el.style.backgroundColor = prev }, 1400)
        void rect
        return
      }
    }
  }, [])

  // Stable refs for callbacks used inside the wrapping effect (stable deps = no re-wrap on click).
  const loadStudyNodeRef = useRef(loadStudyNode)
  const setChooserRef = useRef(setChooser)
  const solvingProblem = useProblemStore((s) => s.phase === 'solving')
  // A square named in the text only makes sense on the position the text is
  // talking about: a click puts the board at the last move written before it,
  // then lights the square ("a2-g8": the whole diagonal; "d4-d5": an arrow).
  // Hovering only shows it on a thumbnail (S7).
  const showMention = (entry: { iso: IsolatedMove; tree: GameTree }) => {
    // A move of a fragment no game holds: its square on the board as it is (S3).
    if (entry.tree === NO_GAME_TREE) { setIsolatedHighlight(mentionMark(entry.iso, shownBoardFen())); return }
    const at = nodeBeforeOffset(entry.tree, entry.iso.charStart ?? 0)
    const mark = mentionMark(entry.iso, at ? at.fen : entry.tree.startFen)
    const board = useStudyBoardStore.getState()
    board.commitPreview()
    if (board.activeGame !== entry.tree || board.currentNodeId !== (at?.id ?? null) || board.playFen) {
      loadStudyPosition(entry.tree, at ? at.id : null, !!at && !entry.tree.mainline.includes(at.id))
    }
    setIsolatedHighlight(mark)
  }
  // A reference of the text (idea move, plan list, advance, files): a click puts
  // the board at the last move written before it and lights it with its arrows (S13-S15).
  const showReference = (entry: RefEntry) => {
    const board = useStudyBoardStore.getState()
    if (entry.tree) {
      board.commitPreview()
      const at = entry.node
      if (board.activeGame !== entry.tree || board.currentNodeId !== (at?.id ?? null) || board.playFen) {
        loadStudyPosition(entry.tree, at ? at.id : null, !!at && !entry.tree.mainline.includes(at.id))
      }
    }
    const mark = referenceMark(entry.ref, entry.node?.fen ?? entry.tree?.startFen ?? shownBoardFen())
    const { sequence, ...base } = mark
    if (sequence) useStudyBoardStore.getState().playHighlightSequence({ ...base, line: [] }, sequence, PROSE_REVEAL_STEP_MS, prefersReducedMotion())
    else setIsolatedHighlight(base)
  }
  /**
   * A game about to be rewritten in place (S6): remember where its container is
   * on screen, so it stays there after the chapter renders again, and flash it.
   */
  const pendingRefresh = useRef<{ gameIndex: number; offset: number | null } | null>(null)
  /** The active move is not followed (scrolled to) right after a rewrite: the reader keeps their place. */
  const followPausedUntil = useRef(0)
  /** The move the board loaded on its own when the chapter opened: not scrolled to (S1). */
  const autoLoadedKey = useRef<string | null>(null)
  const markGameRefresh = (gameIndex: number) => {
    const main = mainRef.current
    const box = contentRef.current?.querySelector(`[data-game-container="${gameIndex}"]`)
    pendingRefresh.current = { gameIndex, offset: main && box ? captureOffset(main, box) : null }
    followPausedUntil.current = Date.now() + 2500
  }
  /**
   * Switch one game's comments to the other form (braces ⇄ paragraphs), in place:
   * the choice is kept per book, chapter and game and applied when the chapter
   * renders, from the game's first move to its last one (S11). Runs under the
   * spinner, keeping the game where it was on screen (S6).
   */
  const toggleLayout = (gameIndex: number) => {
    // How the game is written NOW (read from the text, not the recogniser's source).
    const summary = gameSummaries[gameIndex]
    if (!summary) return
    const book = id
    const chapter = currentChapter
    markGameRefresh(gameIndex)
    void withBusy('Switching the comment layout', async () => {
      await nextPaint()
      saveGameLayout(book, chapter, gameIndex, summary.braces ? 'paragraphs' : 'braces')
      // The board reopens the same game on its rewritten text.
      saveBoardMemory(book, { chapter, gameIndex, nodeId: null, annotations: {} })
      useStudyBoardStore.getState().clearGame()
      setLayoutVersion((v) => v + 1)
      await nextPaint()
    })
  }
  // The book's name, for the tab of an analysis board opened from its text (S11).
  const queryClient = useQueryClient()
  const bookName = () => queryClient.getQueryData<Book[]>(['library', 'books'])?.find((b) => b.id === id)?.title
  const bookNameRef = useRef(bookName)
  useEffect(() => { bookNameRef.current = bookName })
  const toggleLayoutRef = useRef(toggleLayout)
  useEffect(() => { toggleLayoutRef.current = toggleLayout })
  /**
   * Comment one game again, in place (S3): its comments, variations and images
   * from its first move to its last are replaced by its main line commented
   * with the options selected in the review panel; the book's text is kept and
   * a second click on the same icon restores it exactly as it was. Both run
   * under the spinner, keeping the game where it was on screen (S6).
   */
  const toggleRecomment = (gameIndex: number) => {
    const store = useGameRewriteStore.getState()
    const book = id
    const chapter = currentChapter
    const resetBoard = () => {
      saveBoardMemory(book, { chapter, gameIndex, nodeId: null, annotations: {} })
      useStudyBoardStore.getState().clearGame()
    }
    if (store.rewrites[rewriteKey(book, chapter)]?.[gameIndex]) {
      markGameRefresh(gameIndex)
      void withBusy('Restoring the book\'s text', async () => {
        await nextPaint()
        const previous = useGameRewriteStore.getState().clear(book, chapter, gameIndex)
        if (previous?.layout) saveGameLayout(book, chapter, gameIndex, previous.layout)
        resetBoard()
        setLayoutVersion((v) => v + 1)
        await nextPaint()
      })
      return
    }
    if (!games[gameIndex]) return
    const chapterGames = games
    const text = plainText
    markGameRefresh(gameIndex)
    // The footer bar moves with each position the engine analyses (S5); it can be cancelled.
    void withProgress('Commenting the game again', async (report, signal) => {
      await nextPaint()
      const body = await recommentGame(chapterGames, gameIndex, text, undefined, { onProgress: report, signal })
      if (!body.trim()) { pendingRefresh.current = null; return }
      // The layout chosen before is given back on restore; the new text shows as the panel writes it.
      const layoutBefore = loadGameLayouts(book, chapter)[gameIndex]
      clearGameLayout(book, chapter, gameIndex)
      useGameRewriteStore.getState().save(book, chapter, gameIndex, { text: body, ...(layoutBefore ? { layout: layoutBefore } : {}) })
      resetBoard()
      setLayoutVersion((v) => v + 1)
      await nextPaint()
    }, { cancellable: true }).catch((e: unknown) => {
      pendingRefresh.current = null
      console.warn('[BookReader] could not comment the game again', e)
    })
  }
  /** A game's comments translated: its new text shows in place of the book's (undo: the same icon as a recomment). */
  const applyTranslation = (gameIndex: number, rewrite: { text: string; leading: number }) => {
    const layoutBefore = loadGameLayouts(id, currentChapter)[gameIndex]
    clearGameLayout(id, currentChapter, gameIndex)
    useGameRewriteStore.getState().save(id, currentChapter, gameIndex, { ...rewrite, ...(layoutBefore ? { layout: layoutBefore } : {}) })
    setLayoutVersion((v) => v + 1)
  }
  const toggleRecommentRef = useRef(toggleRecomment)
  useEffect(() => { toggleRecommentRef.current = toggleRecomment })
  const showMentionRef = useRef(showMention)
  const showReferenceRef = useRef(showReference)
  useEffect(() => { showReferenceRef.current = showReference })
  useEffect(() => { showMentionRef.current = showMention })
  // A progressive illumination in flight never outlives the reader.
  useEffect(() => () => useStudyBoardStore.getState().cancelHighlightSequence(), [])

  const rawHtml = data?.html ?? ''

  // Rewrite relative img/image src paths to the backend image endpoint
  const titleSeparator = useSettingsStore((s) => s.chapterTitleSeparator)
  // Images resolved to the API, multi-line titles joined, FENs next to diagrams hidden (kept for recognition).
  // Diagram positions accepted this session go in as FEN lines, so the moves after them are read (S7).
  const sessionFens = useSessionFenStore((s) => s.fens)
  // Suggestions made in edit mode this session are shown in place until reload (S8).
  const pendingSuggestions = usePendingSuggestions((s) => s.items)
  const html = useMemo(() => {
    if (!rawHtml || !id) return rawHtml
    const withPending = withPendingSuggestions(rawHtml, pendingSuggestions, bookTitle, currentChapter)
    return withSessionFens(prepareChapterHtml(withPending, id, { titleSeparator }), sessionFens)
  }, [rawHtml, id, titleSeparator, sessionFens, pendingSuggestions, bookTitle, currentChapter])

  // Flatten the chapter to recognition text with the SAME DOM extraction the
  // wrapper uses on the rendered pane, so every node's charStart/charEnd points
  // at the exact DOM characters of its source token (see utils/proseText).
  const basePlainText = useMemo(() => htmlToProseText(html), [html])
  const recognitionAlgorithm = useSettingsStore((s) => s.recognitionAlgorithm)
  const baseGames = useMemo(
    () => recognizeGames(basePlainText, { algorithm: recognitionAlgorithm }),
    [basePlainText, recognitionAlgorithm],
  )
  // The comment layout chosen per game is applied to the chapter's own HTML;
  // the rest of the chapter (and every other chapter) is left untouched (S11).
  const [layoutVersion, setLayoutVersion] = useState(0)
  const layouts = useMemo(
    () => loadGameLayouts(id, currentChapter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, currentChapter, layoutVersion],
  )
  // Games commented again are put back in place first (S3), then the layouts are applied to them.
  const chapterRewrites = useGameRewriteStore((s) => s.rewrites[rewriteKey(id, currentChapter)])
  const rewrittenHtml = useMemo(
    () => (chapterRewrites ? applyGameRewrites(html, baseGames, chapterRewrites) : html),
    [html, baseGames, chapterRewrites],
  )
  const rewrittenText = useMemo(
    () => (rewrittenHtml === html ? basePlainText : htmlToProseText(rewrittenHtml)),
    [rewrittenHtml, html, basePlainText],
  )
  const rewrittenGames = useMemo(
    () => (rewrittenText === basePlainText ? baseGames : recognizeGames(rewrittenText, { algorithm: recognitionAlgorithm })),
    [rewrittenText, basePlainText, baseGames, recognitionAlgorithm],
  )
  const layoutHtml = useMemo(
    () => applyGameLayouts(rewrittenHtml, rewrittenGames, layouts),
    [rewrittenHtml, rewrittenGames, layouts],
  )
  // Book comments shown again: one remark per position picked anew (S4).
  const bookComments = useReaderViewStore((s) => s.bookComments)
  const commentPick = useReaderViewStore((s) => s.commentPick)
  const textWidth = useReaderViewStore((s) => s.textWidth)
  const shownHtml = useMemo(() => pickBookComments(layoutHtml, commentPick), [layoutHtml, commentPick])
  const plainText = useMemo(
    () => (shownHtml === html ? basePlainText : shownHtml === rewrittenHtml ? rewrittenText : htmlToProseText(shownHtml)),
    [shownHtml, html, basePlainText, rewrittenHtml, rewrittenText],
  )
  const games = useMemo(
    () => (plainText === basePlainText ? baseGames
      : plainText === rewrittenText ? rewrittenGames
        : recognizeGames(plainText, { algorithm: recognitionAlgorithm })),
    [plainText, basePlainText, baseGames, rewrittenText, rewrittenGames, recognitionAlgorithm],
  )
  const [editMode, setEditMode] = useState(false)
  const isMainlineMove = useCallback(
    (gameIndex: number, nodeId: string) => games[gameIndex]?.tree.mainline.includes(nodeId) ?? false,
    [games],
  )
  /** Each game's heading, label and anchor (S9, S15). */
  const gameSummaries = useMemo(() => describeGames(plainText, games), [plainText, games])

  // When the algorithm changes the recognised trees are rebuilt, so any game
  // open in the study board points at a stale tree. Close it so the viewer and
  // the debug panel always reflect the SAME algorithm.
  const clearStudyGame = useStudyBoardStore((s) => s.clearGame)
  useEffect(() => {
    clearStudyGame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recognitionAlgorithm])

  // Opening a chapter selects its first move, so the arrow keys work at once —
  // or the move the reader was at before a refresh, with its arrows and marks (S11).
  useEffect(() => {
    if (games.length === 0) return
    const board = useStudyBoardStore.getState()
    if (games.some((g) => g.tree === board.activeGame)) return
    const memory = loadBoardMemory(id)
    if (memory && memory.chapter === currentChapter && games[memory.gameIndex]) {
      const tree = games[memory.gameIndex].tree
      const nodeId = memory.nodeId && tree.nodes.has(memory.nodeId) ? memory.nodeId : tree.mainline[0] ?? null
      board.setAnnotationsByNode(memory.annotations ?? {})
      autoLoadedKey.current = nodeId ? `${memory.gameIndex}:${nodeId}` : null
      board.loadPosition(tree, nodeId, !!nodeId && !tree.mainline.includes(nodeId))
      return
    }
    const first = games[0].tree
    autoLoadedKey.current = first.mainline[0] ? `0:${first.mainline[0]}` : null
    board.loadPosition(first, first.mainline[0] ?? null, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games])

  // Remember where the reader is (and what was drawn), to come back after a refresh.
  useEffect(() => useStudyBoardStore.subscribe((s, prev) => {
    if (s.previewBase || (s.currentNodeId === prev.currentNodeId && s.annotations === prev.annotations && s.activeGame === prev.activeGame)) return
    const gameIndex = games.findIndex((g) => g.tree === s.activeGame)
    if (gameIndex < 0) return
    saveBoardMemory(id, {
      chapter: currentChapter, gameIndex, nodeId: s.currentNodeId,
      annotations: { ...s.annotationsByNode, [s.currentNodeId ?? '@start']: { ...s.annotations, pen: null } },
    })
  }), [games, id, currentChapter])

  // Flatten every game's recognition errors for the error panel.
  const recognitionErrors = useMemo<FlatError[]>(
    () =>
      games.flatMap((g, gameIndex) =>
        g.tree.errors.map((e) => ({ ...e, gameIndex })),
      ),
    [games],
  )
  const [showErrors, setShowErrors] = useState(false)

  // Keep refs in sync so the wrapping effect (stable deps) always calls latest version.
  useEffect(() => { loadStudyNodeRef.current = loadStudyNode }, [loadStudyNode])
  useEffect(() => { setChooserRef.current = setChooser }, [setChooser])

  const activeNodeId = useStudyBoardStore((s) => s.currentNodeId)
  const activeGame = useStudyBoardStore((s) => s.activeGame)
  // node ids are only unique WITHIN a game (the counter resets per game), so the
  // same "node-1" exists in every recognised game. Identify the active game so a
  // click highlights only the clicked occurrence, not every game's "node-1".
  const activeGameIndex = useMemo(
    () => games.findIndex((g) => g.tree === activeGame),
    [games, activeGame],
  )
  // Composite, globally-unique span key.
  const activeSpanKey = activeNodeId !== null && activeGameIndex >= 0
    ? `${activeGameIndex}:${activeNodeId}`
    : null

  const activeSummary = activeGameIndex >= 0 ? gameSummaries[activeGameIndex] : undefined

  // Registry mapping a span key → its resolved game move, rebuilt on every wrap.
  // Event handlers (delegated, mounted once) look up rich objects here by the
  // span's data-node-id, so re-wrapping never detaches behaviour from spans.
  const moveRegistry = useRef(new Map<string, ResolvedNode>())
  // Registry for isolated prose moves: span key → { square, piece }.
  const isoRegistry = useRef(new Map<string, { iso: IsolatedMove; tree: GameTree }>())
  const refRegistry = useRef(new Map<string, RefEntry>())

  // Wraps SAN moves in spans. Re-runs ONLY when the content changes (new
  // chapter), NOT on click/hover — the active-move highlight is a separate,
  // cheap effect below that just toggles a class. This keeps the heavy DOM
  // surgery out of the click path, so opening the tooltip / variation chooser
  // never re-wraps (and never wipes) the prose.
  useEffect(() => {
    const container = contentRef.current
    if (!container || !shownHtml) return

    // Remove the game frames and previous markers (idempotent re-wrap).
    unwrapGameContainers(container)
    clearGameDecorations(container)
    container.querySelectorAll('span[data-san], span[data-iso-square], span[data-ref-key], span[data-unplaced]').forEach((el) => {
      const parent = el.parentNode
      if (parent) {
        // The book's own spelling (S12: the span may show another notation).
        parent.replaceChild(document.createTextNode(el.getAttribute('data-raw') ?? el.textContent ?? ''), el)
        parent.normalize()
      }
    })

    moveRegistry.current.clear()
    isoRegistry.current.clear()
    refRegistry.current.clear()

    // Mark paragraphs that begin with a chess move/annotation so the config CSS
    // can zero their first-line indent. Idempotent: clears the class first.
    container.querySelectorAll('p.move-line').forEach((p) => p.classList.remove('move-line'))
    if (bookConfig.moveLineIndent.zeroIndent) {
      container.querySelectorAll('p').forEach((p) => {
        if (isMoveLine(p.textContent ?? '')) p.classList.add('move-line')
      })
    }

    // Positional wrapping: each recognised node/isolated move paints exactly
    // the DOM characters it was parsed from — no SAN/regex re-matching.
    const prose = extractProseText(container)
    // Moves of fragments no game holds (no position to start from) are marks of no game (S3).
    const unanchored = unanchoredMoves(prose.text, games)
    if (games.length > 0) {
      if (prose.text !== plainText) {
        console.warn('[BookReader] prose text mismatch; move positions may be off')
      }
      // Frame every game (start/end markers, heading, hidden region) before the
      // text nodes are split into move spans: the frames only move whole blocks.
      decorateGames(container, prose, games, gameSummaries, { chapter: currentChapter })
      // Right after each game's layout switch: comment the game again / restore the book's text (S3).
      const rewritten = useGameRewriteStore.getState().rewrites[rewriteKey(id, currentChapter)] ?? {}
      container.querySelectorAll<HTMLElement>('[data-game-marker="start"] [data-layout-toggle]').forEach((toggle) => {
        const index = Number(toggle.dataset.layoutToggle)
        const done = !!rewritten[index]
        const label = done ? 'Restore the book\'s text' : 'Comment this game again'
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'game-recomment-toggle'
        button.setAttribute('data-recomment', String(index))
        button.setAttribute('aria-label', label)
        button.setAttribute('aria-pressed', String(done))
        button.title = label
        toggle.after(button)
      })
      // Each game in its own container, from its start marker to its end marker (S6).
      wrapGameContainers(container)
    }
    // Idea moves, plan lists, pawn advances and files named in the text (S13-S15).
    const refs = findProseReferences(prose.text, { lang: 'auto' })
    if (games.length > 0 || unanchored.length > 0 || refs.length > 0) {
      const targets = planMoveTargets(prose.text, games, unanchored, refs)
      const pieces = piecesByTextNode(prose.map, targets)

      let isoSeq = 0
      const isoKeys = new Map<object, string>()
      const baseClass =
        'cursor-pointer font-medium text-blue-700 underline-offset-2 hover:bg-yellow-100 rounded px-0.5'

      for (const [textNode, list] of pieces) {
        const text = textNode.nodeValue ?? ''
        const frag = document.createDocumentFragment()
        let cursor = 0
        for (const piece of list) {
          if (piece.start < cursor) continue
          if (piece.start > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, piece.start)))
          const t = piece.target
          const span = document.createElement('span')
          span.textContent = text.slice(piece.start, piece.end)
          if (t.kind === 'ref') {
            const refKey = `ref-${isoSeq++}`
            const at = positionBefore(games, t.start)
            refRegistry.current.set(refKey, { ref: t.ref, tree: at?.tree ?? null, node: at?.node ?? null })
            span.setAttribute('data-ref-key', refKey)
            span.className =
              'cursor-pointer rounded px-0.5 font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 ring-1 ring-amber-300'
            span.title = 'Mostrar en el tablero'
          } else if (t.kind === 'iso') {
            // Isolated prose move (—d5—, "casilla e4", "Cb5") → board-square highlight.
            let isoKey = isoKeys.get(t)
            if (!isoKey) {
              isoKey = `iso-${isoSeq++}`
              isoKeys.set(t, isoKey)
              isoRegistry.current.set(isoKey, { iso: t.iso, tree: t.gameIndex >= 0 ? games[t.gameIndex].tree : NO_GAME_TREE })
            }
            span.setAttribute('data-iso-square', t.iso.square)
            span.setAttribute('data-iso-key', isoKey)
            span.className =
              'cursor-pointer rounded px-0.5 font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 ring-1 ring-amber-300'
            span.title = `Casilla ${t.iso.square} (jugada aislada)`
          } else {
            const spanKey = `${t.gameIndex}:${t.node.id}`
            moveRegistry.current.set(spanKey, { tree: t.tree, node: t.node, gameIndex: t.gameIndex })
            const hasAlt = hasAlternativesAhead(t.tree, t.node)
            span.setAttribute('data-san', t.node.san)
            span.setAttribute('data-node-id', spanKey)
            span.setAttribute('data-game-index', String(t.gameIndex))
            span.setAttribute('data-move-number', String(t.node.moveNumber))
            span.setAttribute('data-color', t.node.color)
            span.setAttribute('data-has-alt', hasAlt ? '1' : '0')
            span.setAttribute('data-fen', t.node.fen)
            if (t.node.from) span.setAttribute('data-from', t.node.from)
            if (t.node.to) span.setAttribute('data-to', t.node.to)
            // Inactive base styling; the active highlight is applied separately.
            span.className = hasAlt ? `${baseClass} underline decoration-dotted decoration-2` : baseClass
            if (t.node.correctedFrom) {
              // The source has a wrong move here; the board plays the correction.
              span.setAttribute('data-corrected-to', t.node.san)
              span.className = `${baseClass} underline decoration-wavy decoration-red-500 decoration-2`
              span.title = `Jugada errónea en el texto: ${t.node.correctedFrom}. Corrección propuesta: ${t.node.san}`
            }
          }
          frag.appendChild(span)
          cursor = piece.end
        }
        if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)))
        textNode.parentNode?.replaceChild(frag, textNode)
      }
    }
    paintUnplacedMoves(container, games)
    // Heading-like paragraphs of the EPUB (classes, its stylesheet, inline CSS) as headings (S8).
    detectHeadings(container)
  }, [shownHtml, games, plainText, gameSummaries, currentChapter, id, bookConfig.moveLineIndent.zeroIndent])

  // Moves in the text written with the chosen notation (S12): figurines or the
  // letters of the language. The book's spelling stays in data-raw.
  useEffect(() => {
    const container = contentRef.current
    if (container) formatMoveSpans(container, notationLang, notationStyle)
  }, [shownHtml, games, plainText, gameSummaries, currentChapter, id, bookConfig.moveLineIndent.zeroIndent, notationLang, notationStyle])

  // Every move coloured by its evaluation, when switched on in the top bar (S11).
  const evalColoring = useEvalColoringStore((s) => s.enabled)
  const evalEntries = useEvalColoringStore((s) => s.entries)
  useEffect(() => {
    const container = contentRef.current
    if (!container) return
    paintMoveQualities(container, evalColoring
      ? (gameIndex) => (games[gameIndex] ? qualitiesOf(evalEntries, id, currentChapter, gameIndex, games[gameIndex].tree) : null)
      : null)
  }, [shownHtml, games, plainText, gameSummaries, currentChapter, id, bookConfig.moveLineIndent.zeroIndent, evalColoring, evalEntries])
  const bookChapters = useMemo(
    () => (toc.length > 0 ? [...new Set(toc.map((e) => e.order))].sort((a, b) => a - b) : [currentChapter]),
    [toc, currentChapter],
  )
  const loadBookChapterGames = (chapter: number) =>
    loadChapterGames(id, chapter, { bookTitle, titleSeparator, algorithm: recognitionAlgorithm })

  // A game just rewritten in place (S6): back where it was on screen, then flashed.
  // Again after a paint, once the diagrams around it have taken their size.
  useEffect(() => {
    const pending = pendingRefresh.current
    const main = mainRef.current
    const find = () => contentRef.current?.querySelector(`[data-game-container="${pending?.gameIndex}"]`) ?? null
    const box = pending ? find() : null
    if (!pending || !box) return
    pendingRefresh.current = null
    const keep = () => {
      const el = find()
      if (main && el && pending.offset !== null) restoreOffset(main, el, pending.offset)
    }
    keep()
    flashElement(box)
    void nextPaint().then(keep)
  }, [shownHtml, games])

  // Wrap each book diagram <img> with an interactive DiagramImage overlay
  // (original ↔ autogenerated board toggle + eval footer + config menu). The
  // image's FEN is inferred from the mainline moves that precede it in the text.
  const diagramRoots = useRef<Root[]>([])
  /** Positions of the book diagrams of this chapter (for "evaluate all diagrams"). */
  const [diagramFens, setDiagramFens] = useState<string[]>([])
  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    // Tear down any previously-mounted overlays before re-mounting (deferred:
    // a store update can flush this effect while React is still rendering).
    unmountLater(diagramRoots.current)
    diagramRoots.current = []

    // Images in table cells (rating icons, symbols) and small icons are not
    // board diagrams: they stay plain images, or the tables break (S14).
    const tooSmall = (img: HTMLImageElement) => {
      const w = Number(img.getAttribute('width')) || (img.complete ? img.naturalWidth : 0)
      const h = Number(img.getAttribute('height')) || (img.complete ? img.naturalHeight : 0)
      return (w > 0 && w < 40) || (h > 0 && h < 40)
    }
    const images = Array.from(container.querySelectorAll('img')).filter(
      (img) => !img.closest('[data-diagram-overlay], td, th') && !tooSmall(img),
    )

    const bookDiagrams: string[] = []
    for (const img of images) {
      // Character offset of this image = length of all text before it in the DOM.
      // The moves written before the image, in reading order (S14): the text's
      // character offsets and the page's are not the same text, so the move
      // spans of the page are read instead.
      const before = movesBeforeImage(img, container, (gameIndex, nodeId) => games[gameIndex]?.tree.mainline.includes(nodeId) ?? false)

      // A diagram written by the commentary carries its position.
      // The book's FEN (or the hidden FEN next to it) first, else the position after the last main-line move.
      const { fen, known } = diagramFenOf(img, before.main?.fen ?? INITIAL_FEN)
      const src = img.getAttribute('src') ?? ''
      const alt = img.getAttribute('alt') ?? 'diagram'

      const mount = document.createElement('span')
      mount.setAttribute('data-diagram-overlay', '1')
      // A diagram written by the commentary is centred, as in a book.
      if (img.classList.contains('diagram')) mount.className = 'diagram-host'
      img.replaceWith(mount)

      const root = createRoot(mount)
      root.render(<DiagramImage src={src} alt={alt} fen={fen} fenKnown={known} textFen={img.getAttribute('data-text-fen') ?? undefined} withEval={!img.classList.contains('diagram')} mainBefore={before.main} variationBefore={before.variation} />)
      if (!img.classList.contains('diagram')) bookDiagrams.push(fen)
      diagramRoots.current.push(root)
    }

    setDiagramFens(bookDiagrams)

    return () => {
      unmountLater(diagramRoots.current)
      diagramRoots.current = []
    }
  }, [shownHtml, games])

  // Active-move highlight — cheap class toggle, decoupled from wrapping. Runs on
  // every active-node change WITHOUT touching the DOM structure, so clicks and
  // the tooltip/chooser never disturb the wrapped prose.
  useEffect(() => {
    const container = contentRef.current
    if (!container) return
    container.querySelectorAll('span[data-node-id]').forEach((el) => {
      const span = el as HTMLElement
      const active = span.dataset.nodeId === activeSpanKey
      span.classList.toggle('font-bold', active)
      span.classList.toggle('bg-yellow-300', active)
      // Keep the link colour only while inactive (active is yellow + bold).
      span.classList.toggle('text-blue-700', !active)
      if (active && activeSpanKey !== autoLoadedKey.current && Date.now() > followPausedUntil.current) followActiveMove(span, autoscroll)
    })
  }, [activeSpanKey, shownHtml, games, autoscroll])

  // Scroll per chapter (S12): a chapter never opened starts at its top; one read
  // before comes back to where the reader left it. A game picked in the table of
  // contents is scrolled to once its chapter is on screen.
  const mainRef = useRef<HTMLElement>(null)
  const restoredScroll = useRef<string | null>(null)
  const pendingAnchor = useRef<string | null>(null)
  const scrollKey = `${id}:${currentChapter}`
  useEffect(() => {
    const main = mainRef.current
    if (isLoading || !shownHtml || !main) return
    if (restoredScroll.current !== scrollKey) {
      main.scrollTop = getChapterScroll(id, currentChapter) ?? 0
      restoredScroll.current = scrollKey
    }
    if (pendingAnchor.current) {
      const target = document.getElementById(pendingAnchor.current)
      if (target) {
        pendingAnchor.current = null
        target.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
      }
    }
  }, [isLoading, shownHtml, games, scrollKey, id, currentChapter])
  // Changing the column width keeps the first visible line where it was (S10).
  const widthAnchor = useRef<ScrollAnchor | null>(null)
  const captureWidthAnchor = useCallback(() => {
    const main = mainRef.current
    const content = contentRef.current
    widthAnchor.current = main && content ? captureTopAnchor(main, content.querySelectorAll(ANCHOR_BLOCKS)) : null
  }, [])
  useLayoutEffect(() => {
    const anchor = widthAnchor.current
    const main = mainRef.current
    widthAnchor.current = null
    if (anchor && main) restoreTopAnchor(main, anchor)
  }, [textWidth])
  const onMainScroll = () => {
    const main = mainRef.current
    // Only once this chapter's position was restored: a scroll caused by the
    // previous chapter's content going away must not be saved for this one.
    if (main && restoredScroll.current === scrollKey) saveChapterScroll(id, currentChapter, main.scrollTop)
  }
  const goToGame = (chapter: number, index: number) => {
    const anchor = gameAnchorId(chapter, index)
    if (chapter === currentChapter) {
      document.getElementById(anchor)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
      return
    }
    pendingAnchor.current = anchor
    goTo(chapter)
  }

  // Delegated pointer/click handlers — mounted ONCE on the content container.
  // They read data-* attributes + the registries, so re-wrapping spans (which
  // destroys per-span listeners) never breaks hover tooltips or clicks.
  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    const findSpan = (target: EventTarget | null): HTMLElement | null => {
      let el = target as HTMLElement | null
      while (el && el !== container) {
        if (el.dataset.nodeId || el.dataset.isoKey || el.dataset.refKey) return el
        el = el.parentElement
      }
      return null
    }

    /** A move of a line written in a comment (S5). */
    const findLineMove = (target: EventTarget | null): HTMLElement | null => {
      const el = (target as HTMLElement | null)?.closest?.('span.line-move') as HTMLElement | null
      return el && container.contains(el) ? el : null
    }

    const onOver = (e: Event) => {
      const lineMove = findLineMove(e.target)
      if (lineMove) {
        const line = lineOf(lineMove.closest('span.chess-line') as HTMLElement ?? lineMove)
        const ply = Number(lineMove.dataset.ply)
        const shown = line && ply > 0 ? playLine(line.startFen, line.moves, ply).positions[ply - 1] : undefined
        if (!shown) return
        if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
        tooltipTimer.current = setTimeout(() => {
          const rect = lineMove.getBoundingClientRect()
          setTooltipRef.current({
            top: rect.bottom + 6, left: rect.left, fen: shown.fen,
            lastMove: { from: shown.from, to: shown.to }, kind: 'line',
          })
        }, 200)
        return
      }
      const span = findSpan(e.target)
      if (!span) return
      // A square, line or plan named in the text → shown on a thumbnail of the
      // game at that point; the study board is left alone (S7).
      const refKey = span.dataset.refKey
      if (refKey) {
        const entry = refRegistry.current.get(refKey)
        if (!entry) return
        if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
        const fen = entry.node?.fen ?? entry.tree?.startFen ?? shownBoardFen()
        const mark = referenceMark(entry.ref, fen)
        const rect = span.getBoundingClientRect()
        setTooltipRef.current({
          top: rect.bottom + 6, left: rect.left, fen,
          lastMove: null, highlight: mark.square, kind: 'square', line: mark.line,
          ...(mark.arrows ? { arrow: mark.arrows[0], arrows: mark.arrows } : {}),
          ...(mark.sequence ? { sequence: mark.sequence } : {}),
        })
        return
      }
      const isoKey = span.dataset.isoKey
      if (isoKey) {
        const entry = isoRegistry.current.get(isoKey)
        if (!entry) return
        if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
        const at = nodeBeforeOffset(entry.tree, entry.iso.charStart ?? 0)
        const rect = span.getBoundingClientRect()
        const fen = entry.tree === NO_GAME_TREE ? shownBoardFen() : at ? at.fen : entry.tree.startFen
        const mark = mentionMark(entry.iso, fen)
        setTooltipRef.current({
          top: rect.bottom + 6, left: rect.left, fen,
          lastMove: null, highlight: entry.iso.square, kind: 'square',
          ...(mark.line ? { line: mark.line } : {}), ...(mark.arrow ? { arrow: mark.arrow } : {}),
          ...('arrows' in mark && mark.arrows ? { arrows: mark.arrows, from: mark.from } : {}),
        })
        return
      }
      const fen = span.dataset.fen
      if (!fen) return
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
      const from = span.dataset.from
      const to = span.dataset.to
      const resolved = span.dataset.nodeId ? moveRegistry.current.get(span.dataset.nodeId) : undefined
      tooltipTimer.current = setTimeout(() => {
        const rect = span.getBoundingClientRect()
        setTooltipRef.current({
          top: rect.bottom + 6,
          left: rect.left,
          fen,
          lastMove: from && to ? { from, to } : null,
          ...(resolved ? { move: { tree: resolved.tree, node: resolved.node } } : {}),
        })
      }, 200)
    }

    const onOut = (e: Event) => {
      const span = findLineMove(e.target) ?? findSpan(e.target)
      if (!span || (!span.dataset.fen && !span.dataset.isoKey && !span.dataset.refKey && !span.classList.contains('line-move'))) return
      // Don't hide if moving into the tooltip itself.
      const related = (e as MouseEvent).relatedTarget as HTMLElement | null
      if (related?.closest?.('[data-move-tooltip]')) return
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
      tooltipTimer.current = setTimeout(() => setTooltipRef.current(null), 150)
    }

    const onClick = (e: Event) => {
      const toggle = (e.target as HTMLElement | null)?.closest?.('[data-layout-toggle]') as HTMLElement | null
      if (toggle) { toggleLayoutRef.current(Number(toggle.dataset.layoutToggle)); return }
      const recomment = (e.target as HTMLElement | null)?.closest?.('[data-recomment]') as HTMLElement | null
      if (recomment) { toggleRecommentRef.current(Number(recomment.dataset.recomment)); return }
      const target = e.target as HTMLElement | null
      // Review, choose or edit the database comments of this position.
      const tools = target?.closest?.('button[data-comment-tools]') as HTMLElement | null
      if (tools) {
        const quote = tools.closest('blockquote.human-comment')
        const fen = quote?.getAttribute('data-comment-fen')
        if (quote && fen) setRemarkPanelRef.current({ fen, quote })
        return
      }
      // Another book remark of the same position ("1/3" → "2/3").
      const cycle = target?.closest?.('button[data-comment-cycle]') as HTMLElement | null
      if (cycle) {
        const quote = cycle.closest('blockquote.human-comment')
        if (quote) cycleBookComment(quote)
        return
      }
      // A comment's line to a NEW analysis board; the study board is kept (S5).
      const toBoard = target?.closest?.('button.line-to-board') as HTMLElement | null
      if (toBoard) {
        const line = lineOf(toBoard)
        if (line) openAnalysisBoard({ title: line.title, startFen: line.startFen, moves: line.moves, ply: 0, source: bookNameRef.current() })
        return
      }
      const lineMove = findLineMove(target)
      if (lineMove) {
        if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
        setTooltipRef.current(null)
        const line = lineOf(lineMove.closest('span.chess-line') as HTMLElement ?? lineMove)
        if (line) openAnalysisBoard({ title: line.title, startFen: line.startFen, moves: line.moves, ply: Number(lineMove.dataset.ply) || 0, source: bookNameRef.current() })
        return
      }
      // The source of a book comment: open its game in a new tab or a new analysis board (S5).
      const source = target?.closest?.('a.comment-source') as HTMLElement | null
      if (source) {
        e.preventDefault()
        const quote = source.closest('blockquote, [data-no-recognition]')
        const footer = source.closest('footer')?.cloneNode(true) as HTMLElement | undefined
        footer?.querySelectorAll('a.comment-source, button.comment-cycle, button.comment-tools').forEach((a) => a.remove())
        const rect = source.getBoundingClientRect()
        setSourceMenuRef.current({
          top: rect.bottom + 4, left: rect.left,
          gameId: source.dataset.commentGame ?? '', ply: Number(source.dataset.commentPly) || 0,
          text: (quote?.querySelector('p')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          source: (footer?.textContent ?? '').replace(/^[\s—–-]+/, '').replace(/\s+/g, ' ').trim(),
        })
        return
      }
      const span = findSpan(e.target)
      if (!span) return
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
      setTooltipRef.current(null)

      const refKey = span.dataset.refKey
      if (refKey) {
        const entry = refRegistry.current.get(refKey)
        if (entry) showReferenceRef.current(entry)
        return
      }
      // Isolated prose move → highlight its square on the study board.
      const isoKey = span.dataset.isoKey
      if (isoKey) {
        const entry = isoRegistry.current.get(isoKey)
        if (entry) showMentionRef.current(entry)
        return
      }

      const spanKey = span.dataset.nodeId
      if (!spanKey) return
      const resolved = moveRegistry.current.get(spanKey)
      if (!resolved) return
      const hasAlt = span.dataset.hasAlt === '1'
      if (hasAlt) {
        e.stopPropagation()
        const successorId = successorOf(resolved.tree, resolved.node)
        if (!successorId) return
        const rect = span.getBoundingClientRect()
        setChooserRef.current({
          top: rect.bottom + 4,
          left: rect.left,
          tree: resolved.tree,
          successorId,
          siblingLines: variationLinesFrom(resolved.tree, resolved.node),
        })
      } else {
        loadStudyNodeRef.current(resolved.tree, resolved.node)
      }
    }

    container.addEventListener('mouseover', onOver)
    container.addEventListener('mouseout', onOut)
    container.addEventListener('click', onClick)
    return () => {
      container.removeEventListener('mouseover', onOver)
      container.removeEventListener('mouseout', onOut)
      container.removeEventListener('click', onClick)
    }
    // Re-bind when the content container (re)mounts. It does NOT exist on the
    // first render while the chapter is loading (isLoading=true), so binding
    // once with [] would attach to nothing. Re-run once the div appears.
  }, [isLoading, shownHtml])

  const pickChooser = useCallback(
    (targetId: string, isVariation: boolean) => {
      if (!chooser) return
      loadStudyPosition(chooser.tree, targetId, isVariation)
      setShowStudy(true)
      setChooser(null)
    },
    [chooser, loadStudyPosition],
  )

  // Scoped CSS for EPUB rendering based on user settings
  const epubCss = `
    .reader-zoomable { zoom: var(--reader-zoom, 1); }
    .epub-content h1, .epub-content .epub-h1 { font-weight: ${epub.h1.bold ? '700' : '400'}; font-style: ${epub.h1.italic ? 'italic' : 'normal'}; font-size: ${fontSize + epub.h1.sizeDelta}px; margin: 1.2em 0 0.4em; }
    .epub-content h2, .epub-content .epub-h2 { font-weight: ${epub.h2.bold ? '700' : '400'}; font-style: ${epub.h2.italic ? 'italic' : 'normal'}; font-size: ${fontSize + epub.h2.sizeDelta}px; margin: 1em 0 0.3em; }
    .epub-content h3, .epub-content .epub-h3 { font-weight: ${epub.h3.bold ? '700' : '400'}; font-style: ${epub.h3.italic ? 'italic' : 'normal'}; font-size: ${fontSize + epub.h3.sizeDelta}px; margin: 0.9em 0 0.3em; }
    .epub-content h4, .epub-content .epub-h4 { font-weight: ${epub.h4.bold ? '700' : '400'}; font-style: ${epub.h4.italic ? 'italic' : 'normal'}; font-size: ${fontSize + epub.h4.sizeDelta}px; margin: 0.8em 0 0.2em; }
    .epub-content h5, .epub-content .epub-h5 { font-weight: ${epub.h5.bold ? '700' : '400'}; font-style: ${epub.h5.italic ? 'italic' : 'normal'}; font-size: ${fontSize + epub.h5.sizeDelta}px; margin: 0.7em 0 0.2em; }
    .epub-content p  { margin-bottom: ${epub.paragraphSpacing}rem; text-indent: ${epub.paragraphIndent}rem; line-height: 1.7; }
    .epub-content p.diagram-eval { text-align: center; text-indent: 0; font-size: 0.85em; color: #555; margin-top: -0.5rem; }
    .epub-content blockquote.human-comment { border-left: 3px solid #a16207; background: #fefce8; padding: 0.4rem 0.8rem; margin: 0.6rem 0; color: #422006; font-style: italic; }
    .epub-content blockquote.human-comment p { text-indent: 0; margin-bottom: 0.2rem; }
    .epub-content blockquote.human-comment button.comment-cycle { margin-left: 0.4rem; border: 1px solid #a16207; border-radius: 4px; background: #fff; padding: 0 0.35rem; font-size: 0.85em; color: #78350f; cursor: pointer; }
    .epub-content blockquote.human-comment button.comment-tools { margin-left: 0.3rem; border: 1px solid #a16207; border-radius: 4px; background: #fff; padding: 0 0.3rem; font-size: 0.85em; color: #78350f; cursor: pointer; }
    .epub-content blockquote.human-comment footer { font-style: normal; font-size: 0.8em; color: #78716c; }
    .epub-content p.diagram-line { text-align: center; text-indent: 0; font-size: 0.85em; color: #334155; margin-top: -0.6rem; }
    .epub-content p.diagram-alt { color: #64748b; font-style: italic; }
    .epub-content .diagram-host { display: block; text-align: center; margin: 1rem 0 0.75rem; }
    .epub-content .diagram-host img { margin: 0 auto; }
    .epub-content img.diagram { margin-left: auto; margin-right: auto; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25); }
    .epub-content .epub-heading { text-indent: 0; line-height: 1.3; color: #0f172a; }
    .epub-content .game-marker { display: flex; align-items: center; gap: 0.5rem; margin: 1.6em 0 0.6em; font-size: 0.75rem; color: #64748b; }
    .epub-content .game-marker::before { content: attr(data-label); white-space: nowrap; font-weight: 600; letter-spacing: 0.02em; }
    .epub-content .game-marker::after { content: ''; flex: 1; border-top: 1px dashed #94a3b8; }
    .epub-content .game-marker-end { margin: 0.6em 0 1.6em; }
    .epub-content .game-marker-end::before { font-weight: 400; font-style: italic; }
    .epub-content .game-layout-toggle { order: 2; border: 1px solid #cbd5e1; border-radius: 0.25rem; background: #fff; padding: 0 0.35rem; font-size: 0.7rem; color: #475569; line-height: 1.4; }
    .epub-content .game-layout-toggle::before { content: attr(data-glyph); }
    .epub-content .game-layout-toggle:hover { background: #f1f5f9; }
    .epub-content .game-recomment-toggle { order: 3; width: 1.6rem; height: 1.15rem; border: 1px solid #cbd5e1; border-radius: 0.25rem; background: #fff center / 0.9rem no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.9-.9L3 21l1.9-5.6A8.4 8.4 0 0 1 12.5 3c2.4 0 4.6 1 6.1 2.6'/%3E%3Cpath d='M21 3v5h-5'/%3E%3C/svg%3E"); }
    .epub-content .game-recomment-toggle:hover { background-color: #f1f5f9; }
    .epub-content .game-recomment-toggle[aria-pressed="true"] { border-color: #f59e0b; background-color: #fffbeb; }
    .hide-book-comments .epub-content blockquote.human-comment { display: none; }
    @keyframes flash-update-fade { from { background-color: rgba(251, 191, 36, 0.45); } to { background-color: transparent; } }
    .epub-content .flash-update { animation: flash-update-fade 2s ease-out; border-radius: 0.25rem; }
    @media (prefers-reduced-motion: reduce) { .epub-content .flash-update { animation: none; outline: 2px solid #f59e0b; outline-offset: 2px; } }
    .epub-content .game-heading-line { text-indent: 0; margin-bottom: 0.1rem; padding: 0 0.75rem; background: #f8fafc; border-left: 3px solid #2563eb; color: #1e293b; }
    .epub-content .game-heading-first { padding-top: 0.4rem; font-weight: 700; font-size: 1.05em; }
    .epub-content .game-heading-last { padding-bottom: 0.4rem; margin-bottom: ${epub.paragraphSpacing}rem; font-style: italic; }
    .epub-content hr { border: none; border-top: 1px solid #cbd5e1; margin: 1.5em 0; }
    .epub-content img { max-width: 100%; height: auto; display: block; margin: 1rem ${epub.imageAlign === 'center' ? 'auto' : epub.imageAlign === 'right' ? '0 0 auto' : '0 auto 0 0'}; border-radius: 4px; }
    .epub-content ul { list-style: disc; padding-left: 1.5rem; margin-bottom: ${epub.paragraphSpacing}rem; }
    .epub-content ol { list-style: decimal; padding-left: 1.5rem; margin-bottom: ${epub.paragraphSpacing}rem; }
    .epub-content li { margin-bottom: 0.25rem; line-height: 1.6; }
    .epub-content blockquote { border-left: 3px solid #94a3b8; padding-left: 1rem; margin: 1rem 0; color: #64748b; font-style: italic; }
    .epub-content table { border-collapse: collapse; width: 100%; margin-bottom: ${epub.paragraphSpacing}rem; }
    .epub-content td, .epub-content th { border: 1px solid #cbd5e1; padding: 0.4rem 0.6rem; }
    .epub-content th { background: #f1f5f9; font-weight: 600; }
    ${buildBookConfigCss(bookConfig, epub, fontSize)}
  `

  // Chessboard icon — 4×4 grid SVG
  const ChessboardIcon = () => (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
      <rect x="0" y="0" width="4" height="4" />
      <rect x="8" y="0" width="4" height="4" />
      <rect x="4" y="4" width="4" height="4" />
      <rect x="12" y="4" width="4" height="4" />
      <rect x="0" y="8" width="4" height="4" />
      <rect x="8" y="8" width="4" height="4" />
      <rect x="4" y="12" width="4" height="4" />
      <rect x="12" y="12" width="4" height="4" />
    </svg>
  )

  return (
    // Fills the height the app layout gives it (the window minus the banner and the status footer, S4).
    <div data-testid="book-reader" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <style dangerouslySetInnerHTML={{ __html: epubCss + PENDING_SUGGESTION_CSS }} />

      {/* ── Sticky nav bar ── */}
      <nav className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-4 py-2 shadow-sm backdrop-blur">

        <button
          onClick={() => goTo(currentChapter - 1)}
          disabled={currentChapter <= 1}
          title="Previous chapter"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          onClick={() => goTo(currentChapter + 1)}
          disabled={currentChapter >= maxChapter}
          title="Next chapter"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="mx-1 h-5 w-px bg-slate-200" />

        <button
          onClick={toggleToc}
          title="Table of contents"
          aria-expanded={showToc}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition ${
            showToc
              ? 'border-blue-400 bg-blue-50 text-blue-600'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        </button>

        <span className="ml-2 flex min-w-0 max-w-[420px] items-baseline gap-1.5 truncate text-sm">
          {bookTitle && (
            <span data-testid="reader-book-title" className="truncate font-semibold text-slate-900" title={bookTitle}>
              {bookTitle}
            </span>
          )}
          {bookTitle && <span aria-hidden className="text-slate-300">·</span>}
          <span className="truncate font-medium text-slate-600">
            {data ? formatChapterTitle(data.title, titleSeparator) : '…'}
          </span>
        </span>
        <span className="ml-auto text-xs text-slate-400 shrink-0">
          {toc.length > 0 ? `${currentChapter} / ${maxChapter}` : ''}
        </span>

        <div className="mx-1 h-5 w-px bg-slate-200" />

        {/* Width of the text column (S9). */}
        <WidthControl onBeforeChange={captureWidthAnchor} />
        <TextZoom zoom={textZoom.zoom} onZoomIn={textZoom.zoomIn} onZoomOut={textZoom.zoomOut} onReset={textZoom.reset} />

        {/* Comment layout of the active game: braces ⇄ paragraphs (S7). */}
        {activeSummary && (
          <button
            onClick={() => toggleLayout(activeSummary.index)}
            title={layoutToggleLabel(activeSummary, false)}
            aria-label={layoutToggleLabel(activeSummary, false)}
            className="flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
          >
            <span aria-hidden="true">{activeSummary.braces ? '¶' : '{ }'}</span>
          </button>
        )}

        {/* The comments in another language than the interface's: translate them with AI, one by one. */}
        <TranslateChapterButton
          games={baseGames}
          text={basePlainText}
          bookTitle={bookTitle ?? ''}
          bookAuthor={libraryBook?.author ?? null}
          bookLanguage={libraryBook?.language ?? null}
          chapter={currentChapter}
          canSave={isAdmin}
          onApplied={applyTranslation}
        />

        {/* Book comments in the text, shown or hidden: just before the board button (S4). */}
        <BookCommentsToggle />

        {/* Study board toggle — chessboard grid icon */}
        <button
          onClick={() => setShowStudy((v) => !v)}
          title={showStudy ? 'Hide study board' : 'Show study board'}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition ${
            showStudy
              ? 'border-emerald-400 bg-emerald-50 text-emerald-600'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <ChessboardIcon />
        </button>

        {/* Moves coloured by their evaluation; every move of the whole book evaluated (S11). */}
        <EvalColoringButtons book={id} chapter={currentChapter} games={games} chapters={bookChapters} loadChapterGames={loadBookChapterGames} />

        {/* Study tools: save a line to the trainer, guess the move, the trainer (S7). */}
        <StudyTools onOpen={() => setShowStudy(true)} />

        {/* Edit mode: insert content between blocks, correct a paragraph (S8). */}
        <EditModeButton active={editMode} onToggle={() => setEditMode((v) => !v)} />

        {/* Book config editor — admin / dev-bypass only */}
        {isAdmin && (
          <button
            onClick={() => setShowBookConfig(true)}
            title="Edit book render config"
            aria-label="Edit book render config"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}

        {/* Recognition errors — only when there are any. */}
        {recognitionErrors.length > 0 && (
          <button
            onClick={() => setShowErrors(true)}
            title={`Mostrar ${recognitionErrors.length} error(es) de reconocimiento`}
            aria-label="Mostrar errores de reconocimiento"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-700 shadow-sm transition hover:bg-amber-100"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
              {recognitionErrors.length}
            </span>
          </button>
        )}
      </nav>

      {/* ── Main content ── */}
      <div className="relative flex flex-1 min-h-0">

        {/* Table of contents — left panel on desktop, drawer on small screens; stays open (S13). */}
        {showToc && toc.length > 0 && (
          <aside
            aria-label="Table of contents"
            className="absolute inset-y-0 left-0 z-20 w-72 max-w-[85vw] shrink-0 border-r border-slate-200 bg-white shadow-lg lg:static lg:z-auto lg:shadow-none"
          >
            <ReaderToc
              bookId={id}
              toc={toc}
              currentChapter={currentChapter}
              currentGames={gameSummaries}
              algorithm={recognitionAlgorithm}
              onChapter={goTo}
              onGame={goToGame}
            />
          </aside>
        )}

        {/* Reading pane — always shows original HTML */}
        <main
          ref={mainRef}
          onScroll={onMainScroll}
          className="flex-1 overflow-x-hidden overflow-y-auto px-6 py-8 min-w-0"
        >
          {isLoading ? (
            <div role="status" className="flex justify-center p-16">
              <span className="sr-only">Loading…</span>
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            </div>
          ) : (
            // While a problem is being solved the text would give the move away: it is veiled.
            <div
              data-testid="prose-veil"
              className={`${solvingProblem ? 'pointer-events-none select-none blur-sm transition' : 'transition'}${bookComments ? '' : ' hide-book-comments'}`}
              aria-hidden={solvingProblem || undefined}
            >
              <div data-testid="reader-column" className="reader-zoomable relative mx-auto" style={textWidth || textZoom.zoom !== 100 ? { ...(textWidth ? { maxWidth: `${textWidth}px` } : {}), ...(textZoom.zoom !== 100 ? { '--reader-zoom': textZoom.zoom / 100 } as React.CSSProperties : {}) } : undefined}>
                <ProseContent ref={contentRef} html={shownHtml} />
                {editMode && <EditLayer containerRef={contentRef} rawHtml={rawHtml} shownHtml={shownHtml} book={bookTitle} chapter={currentChapter} isMainline={isMainlineMove} />}
              </div>
            </div>
          )}
          {/* Previous / next chapter at the end of the chapter too (S13). */}
          {!isLoading && (
            <div data-testid="chapter-end-nav" className="mt-10 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <button
                onClick={() => goTo(currentChapter - 1)}
                disabled={currentChapter <= 1}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Previous chapter
              </button>
              <button
                onClick={() => goTo(currentChapter + 1)}
                disabled={currentChapter >= maxChapter}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Next chapter
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </main>

        {/* Drag handle to resize the study panel — only while it's visible. */}
        {showStudy && <StudyPanelResizer />}

        {/* Study board pane — sticky, always mounted, visibility toggled.
            Width is user-resizable (px) via the handle; the board fills it. */}
        <aside
          data-study-pane
          style={showStudy ? { width: studyPanelWidth } : undefined}
          className={`shrink-0 flex flex-col gap-3 bg-white overflow-y-auto ${
            showStudy ? 'px-4 py-5' : 'w-0 overflow-hidden px-0 py-0'
          }`}
        >
          {showStudy && (
            <StudyBoard />
          )}
          {showStudy && games.length > 0 && <NarrationPanel games={games} text={plainText} />}
          {showStudy && games.length > 0 && (
            <TrackPlayer games={games} text={plainText} sample={demoTrackFor(id, currentChapter)} />
          )}
          {showStudy && <PositionIdeasPanel />}
          {showStudy && games.length > 0 && <ProblemPanel games={games} text={plainText} />}
          {showStudy && games.length > 0 && <CorrectionWorkbench games={games} text={plainText} />}
          {showStudy && diagramFens.length > 0 && <DiagramEvalPanel fens={diagramFens} />}
          {showStudy && games.length > 0 && (
            <GameReviewPanel games={games} text={plainText} bookId={id} chapter={currentChapter} />
          )}
          {showStudy && showDebugTools && <RecognitionDebugPanel chapterText={plainText} games={games} />}
          {showStudy && <DiagramToolsPanel root={contentRef.current} />}
        </aside>
      </div>

      {/* ── Bottom prev/next ── */}
      <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-3 shrink-0">
        <button
          onClick={() => goTo(currentChapter - 1)}
          disabled={currentChapter <= 1}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Previous
        </button>
        <button
          onClick={() => goTo(currentChapter + 1)}
          disabled={currentChapter >= maxChapter}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
        >
          Next
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </footer>

      {/* Move hover tooltip — mini board anchored under the hovered move */}
      {tooltip && (
        <div
          data-move-tooltip
          data-testid={tooltip.kind === 'line' ? 'line-move-thumb' : tooltip.kind === 'square' ? 'square-hint-thumb' : 'move-thumb'}
          data-fen={tooltip.fen}
          data-last-move={tooltip.lastMove ? `${tooltip.lastMove.from}${tooltip.lastMove.to}` : undefined}
          data-squares={tooltip.kind === 'square' ? (tooltip.line ?? (tooltip.highlight ? [tooltip.highlight] : [])).join(' ') : undefined}
          className="fixed z-50 shadow-xl rounded-lg overflow-hidden border border-slate-200 bg-white"
          style={{ top: tooltip.top, left: tooltip.left }}
          onMouseEnter={() => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current) }}
          onMouseLeave={() => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); setTooltip(null) }}
        >
          <MoveTooltipCard
            fen={tooltip.fen}
            lastMove={tooltip.lastMove}
            highlight={tooltip.highlight}
            line={tooltip.line}
            arrow={tooltip.arrow}
            arrows={tooltip.arrows}
            from={tooltip.from}
            sequence={tooltip.sequence}
            tree={tooltip.move?.tree}
            node={tooltip.move?.node}
          />
        </div>
      )}

      {/* A book comment's source: new tab or new analysis board (S5) */}
      {sourceMenu && <CommentSourceMenu target={sourceMenu} onClose={closeSourceMenu} />}
      {remarkPanel && <BookRemarkPanel fen={remarkPanel.fen} lang={notationLang} onUse={(remark) => setBookComment(remarkPanel.quote, remark)} onClose={() => setRemarkPanel(null)} />}

      {/* Prose variation chooser — anchored under the clicked move */}
      {chooser && (
        <div className="fixed z-50" style={{ top: chooser.top, left: chooser.left }}>
          <VariationChooser
            tree={chooser.tree}
            mainlineId={chooser.successorId}
            siblingLines={chooser.siblingLines}
            onPickMainline={() => pickChooser(chooser.successorId, false)}
            onPickLine={(i) => pickChooser(chooser.siblingLines[i][0], true)}
            onClose={() => setChooser(null)}
            lang={notationLang}
            style={notationStyle}
          />
        </div>
      )}

      {/* Admin book-config editor */}
      {showBookConfig && isAdmin && (
        <BookConfigEditor bookId={id} onClose={() => setShowBookConfig(false)} />
      )}

      {/* Recognition error panel */}
      {showErrors && (
        <RecognitionErrorPanel
          errors={recognitionErrors}
          onClose={() => setShowErrors(false)}
          onNavigate={navigateToError}
        />
      )}
    </div>
  )
}

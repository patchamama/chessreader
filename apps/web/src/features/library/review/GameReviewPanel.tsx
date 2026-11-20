import { useEffect, useRef, useState } from 'react'
import { useLlm } from '../../../shared/llm'
import { commentedGameText } from './recommentGame'
import { gameLineRange } from '../utils/gameRewrite'
import { rewriteKey, useGameRewriteStore } from '../store/gameRewriteStore'
import { clearGameLayout, loadGameLayouts } from '../store/gameLayoutStore'
import { useNavigate } from 'react-router-dom'
import { Chess } from 'chess.js'
import { annotateGame, coachGame, extractPlayers, numberLine, openingName, reviewGame, treeToPgn } from '@chess-ebook/chess-shared'
import type { KeyMoment, Lang, MoveQuality, RecognizedGame } from '@chess-ebook/chess-shared'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useSettingsStore, STOCKFISH_VERSIONS } from '../../../shared/settings/settingsStore'
import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../../shared/externalBook/externalBookStore'
import { textToChapters } from '../utils/textToChapters'
import { saveBoardMemory } from '../store/boardMemory'
import { saveProgress } from '../store/readingStore'
import { analyseGame } from './reviewEngine'
import { commentWithModel, configuredModel } from './aiCommentary'
import { lichessOpening } from '../../gamesearch/sources'
import { reviewEngine, summarise, useReviewStore } from './reviewStore'
import { downloadAnnotated, type ExportFormat } from './export/annotatedExport'
import { lichessImportGame } from '../../../shared/lichess/lichessImport'
import { hasCommentSource } from '../commentdb/commentLookup'
import { humanCommentsWithLinks, type LinkedHumanComment } from './humanCommentLinks'
import { withBusy } from '../../../shared/layout/busyStore'

interface GameReviewPanelProps {
  games: RecognizedGame[]
  text: string
  bookId: number
  chapter: number
}

const T: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Engine review', run: 'Review and comment the game', all: 'Review and comment every game of the chapter', cancel: 'Cancel', lichess: 'Analyse on Lichess', pgn: 'Download PGN', fen: 'Download FEN', regenerate: 'Re-analyse and regenerate all comments',
    analysing: 'Analysing position', accuracy: 'accuracy', white: 'White', black: 'Black', opening: 'Opening',
    moments: 'Key moments', none: 'No turning points: a steady game.', go: 'Go to', line: 'Play the line',
    better: 'Better was', follow: 'There followed', level: 'Commentary level', l1: '1 · marks only', l2: '2 · remarks and better lines',
    l3: '3 · tactics, opening and summary', open: 'Open annotated game', download: 'Download', downloadFormat: 'Download format', chapter: 'This chapter', book: 'Whole book',
    games: 'games', depth: 'Depth', brilliant: 'brilliant', good: 'very good', dubious: 'inaccuracies', mistake: 'mistakes', blunder: 'blunders',
    ai: 'Comment with a language model', aiBusy: 'Writing commentary…', aiSetup: 'To comment with a language model, set its provider, key and model in Settings.',
    layout: 'Layout', inline: 'Remarks in braces', split: 'A line per remark', paragraphs: 'Paragraph after the moves', diagrams: 'Diagrams at key moments', evalUnder: 'Evaluation under diagrams', diagramHere: 'Diagram at this move', diagramsChosen: 'chosen diagrams',
    coach: 'Coach review: what went well and badly', focus: 'Focus on', focusBoth: 'Both sides',
    players: 'Players are read from PGN tags, from lines "White: … / Black: …" or from a heading "White – Black".',
  },
  es: {
    title: 'Revisión con el motor', run: 'Revisar y comentar la partida', all: 'Revisar y comentar todas las partidas del capítulo', cancel: 'Cancelar', lichess: 'Analizar en Lichess', pgn: 'Descargar PGN', fen: 'Descargar FEN', regenerate: 'Reanalizar y regenerar todos los comentarios',
    analysing: 'Analizando posición', accuracy: 'de precisión', white: 'Blancas', black: 'Negras', opening: 'Apertura',
    moments: 'Momentos clave', none: 'Sin puntos de inflexión: una partida pareja.', go: 'Ir a', line: 'Reproducir la línea',
    better: 'Era mejor', follow: 'Siguió', level: 'Nivel de comentario', l1: '1 · solo signos', l2: '2 · comentarios y líneas mejores',
    l3: '3 · táctica, apertura y resumen', open: 'Abrir la partida comentada', download: 'Descargar', downloadFormat: 'Formato de descarga', chapter: 'Este capítulo', book: 'Todo el libro',
    games: 'partidas', depth: 'Profundidad', brilliant: 'brillantes', good: 'muy buenas', dubious: 'imprecisiones', mistake: 'errores', blunder: 'errores graves',
    ai: 'Comentar con un modelo de lenguaje', aiBusy: 'Escribiendo comentarios…', aiSetup: 'Para comentar con un modelo de lenguaje, configura proveedor, clave y modelo en Ajustes.',
    layout: 'Formato', inline: 'Comentarios entre llaves', split: 'Una línea por comentario', paragraphs: 'Párrafo tras las jugadas', diagrams: 'Diagramas en momentos clave', evalUnder: 'Evaluación bajo los diagramas', diagramHere: 'Diagrama en esta jugada', diagramsChosen: 'diagramas elegidos',
    coach: 'Revisión del maestro: qué hice bien y mal', focus: 'Enfocar en', focusBoth: 'Ambos bandos',
    players: 'Los jugadores se leen de las etiquetas PGN, de líneas "Blancas: … / Negras: …" o de un encabezado "Blancas – Negras".',
  },
  de: {
    title: 'Engine-Analyse', run: 'Partie prüfen und kommentieren', all: 'Alle Partien des Kapitels prüfen und kommentieren', cancel: 'Abbrechen', lichess: 'Auf Lichess analysieren', pgn: 'PGN herunterladen', fen: 'FEN herunterladen', regenerate: 'Neu analysieren und alle Kommentare neu schreiben',
    analysing: 'Analysiere Stellung', accuracy: 'Genauigkeit', white: 'Weiß', black: 'Schwarz', opening: 'Eröffnung',
    moments: 'Schlüsselmomente', none: 'Keine Wendepunkte: eine ausgeglichene Partie.', go: 'Gehe zu', line: 'Variante abspielen',
    better: 'Besser war', follow: 'Es folgte', level: 'Kommentarstufe', l1: '1 · nur Zeichen', l2: '2 · Anmerkungen und bessere Varianten',
    l3: '3 · Taktik, Eröffnung und Zusammenfassung', open: 'Kommentierte Partie öffnen', download: 'Herunterladen', downloadFormat: 'Download-Format', chapter: 'Dieses Kapitel', book: 'Ganzes Buch',
    games: 'Partien', depth: 'Tiefe', brilliant: 'glänzend', good: 'sehr gut', dubious: 'Ungenauigkeiten', mistake: 'Fehler', blunder: 'grobe Fehler',
    ai: 'Mit einem Sprachmodell kommentieren', aiBusy: 'Kommentar wird geschrieben…', aiSetup: 'Zum Kommentieren mit einem Sprachmodell Anbieter, Schlüssel und Modell in den Einstellungen festlegen.',
    layout: 'Layout', inline: 'Anmerkungen in Klammern', split: 'Eine Zeile pro Anmerkung', paragraphs: 'Absatz nach den Zügen', diagrams: 'Diagramme an Schlüsselstellen', evalUnder: 'Bewertung unter Diagrammen', diagramHere: 'Diagramm bei diesem Zug', diagramsChosen: 'gewählte Diagramme',
    coach: 'Trainer-Analyse: was gut und schlecht war', focus: 'Fokus auf', focusBoth: 'Beide Seiten',
    players: 'Die Spieler werden aus PGN-Tags, aus Zeilen "Weiß: … / Schwarz: …" oder aus einer Überschrift "Weiß – Schwarz" gelesen.',
  },
}

const GLYPH: Record<MoveQuality, string> = { brilliant: '!!', good: '!', interesting: '!?', dubious: '?!', mistake: '?', blunder: '??' }
const TONE: Record<MoveQuality, string> = {
  brilliant: 'border-emerald-300 bg-emerald-50', good: 'border-emerald-300 bg-emerald-50', interesting: 'border-amber-300 bg-amber-50',
  dubious: 'border-amber-300 bg-amber-50', mistake: 'border-red-300 bg-red-50', blunder: 'border-red-400 bg-red-50',
}

/**
 * Engine review of a game: how accurately each player played, the moves that
 * changed the game (each with a way back to its position and the line to look
 * at), and the game written out with commentary at a chosen level.
 */
export function GameReviewPanel({ games, text, bookId, chapter }: GameReviewPanelProps) {
  const lang = useSettingsStore((s) => s.language)
  const depth = useSettingsStore((s) => s.reviewDepth)
  const sfUrl = STOCKFISH_VERSIONS[useSettingsStore((s) => s.stockfishVersion)].url
  const setSettings = useSettingsStore((s) => s.set)
  const activeGame = useStudyBoardStore((s) => s.activeGame)
  const loadPosition = useStudyBoardStore((s) => s.loadPosition)
  const byTree = useReviewStore((s) => s.byTree)
  const records = useReviewStore((s) => s.records)
  const setReview = useReviewStore((s) => s.setReview)
  const openBook = useExternalBookStore((s) => s.open)
  const navigate = useNavigate()
  const [progress, setProgress] = useState<{ done: number; total: number; game: number } | null>(null)
  const level = useReviewStore((s) => s.level)
  const setLevel = useReviewStore((s) => s.setLevel)
  const layout = useSettingsStore((s) => s.commentLayout)
  const keyDiagrams = useSettingsStore((s) => s.commentDiagrams)
  const diagramEval = useSettingsStore((s) => s.commentDiagramEval)
  const currentNodeId = useStudyBoardStore((s) => s.currentNodeId)
  const [focus, setFocus] = useState<'white' | 'black' | 'both'>('white')
  /** Moves the reader picked for a diagram (node ids of this game). */
  const diagramAt = useReviewStore((s) => s.diagramAt)
  const setDiagramAt = useReviewStore((s) => s.setDiagramAt)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf')
  const stockfishLabel = STOCKFISH_VERSIONS[useSettingsStore((s) => s.stockfishVersion)].label.replace(/\s*\(.*\)\s*$/, '')
  const cloud = useSettingsStore((s) => s.engineSource) === 'lichess-cloud'
  // Named under each diagram, as books name the engine they used.
  const engine = cloud ? `Lichess cloud / ${stockfishLabel}` : stockfishLabel
  const diagrams = keyDiagrams || diagramAt.length ? { key: keyDiagrams, at: diagramAt, eval: diagramEval, engine, depth } : undefined
  const [database, setDatabase] = useState<{ tree: unknown; eco: string; name: string } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [lichessBusy, setLichessBusy] = useState(false)
  const [lichessError, setLichessError] = useState<string | null>(null)
  // Any configured model, Ollama (no key) included (llm-assistant-round S1).
  const aiReady = useLlm().available
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const t = T[lang]
  if (games.length === 0) return null
  const gameIndex = Math.max(0, games.findIndex((g) => g.tree === activeGame))
  const game = games[gameIndex]
  const reviewed = byTree.get(game.tree)
  const playersOf = (i: number) => extractPlayers(text.slice(i > 0 ? games[i - 1].charEnd : 0, games[i].charEnd))
  const players = playersOf(gameIndex)

  async function run(indexes: number[]) {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      for (const i of indexes) {
        const tree = games[i].tree
        const plies = await analyseGame(tree, reviewEngine(sfUrl), {
          depth, signal: ctrl.signal, onProgress: (done, total) => setProgress({ done, total, game: i }),
        })
        const review = reviewGame(plies)
        // The opening by name, from the masters database when it is reachable (the built-in table otherwise).
        // The Lichess explorer answers 401 without a personal token: ask it only when there is one.
        const lichessToken = useSettingsStore.getState().lichessToken
        if (lichessToken) void lichessOpening(plies.map((p) => `${p.from}${p.to}`), lichessToken).then((o) => { if (o) setDatabase({ tree, ...o }) })
        const who = playersOf(i)
        setReview(tree, { plies, review }, {
          bookId, chapter, gameIndex: i, white: who.white, black: who.black,
          accuracyWhite: review.white.accuracy, accuracyBlack: review.black.accuracy, moves: plies.length,
        })
      }
    } catch {
      // aborted: keep what was finished
    } finally {
      if (abort.current === ctrl) { abort.current = null; setProgress(null) }
    }
  }

  /** Save a small text file in the browser. */
  function saveText(name: string, text: string, mime: string) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  /** The game as PGN, with the players as tags (always available, S20). */
  function downloadPgn() {
    const tags = [`[White "${players.white ?? '?'}"]`, `[Black "${players.black ?? '?'}"]`]
    if (game.tree.startFen !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') tags.push('[SetUp "1"]', `[FEN "${game.tree.startFen}"]`)
    saveText(`${players.white ?? 'game'}-${players.black ?? ''}.pgn`.replace(/[\\/:*?"<>|]+/g, ''), `${tags.join('\n')}\n\n${treeToPgn(game.tree)}\n`, 'application/x-chess-pgn')
  }

  /** The position on the board (or the game's final position) as FEN. */
  function downloadFen() {
    const board = useStudyBoardStore.getState()
    const node = board.activeGame === game.tree && board.currentNodeId ? game.tree.nodes.get(board.currentNodeId) : null
    const fen = board.activeGame === game.tree && board.playFen ? board.playFen
      : node?.fen ?? game.tree.nodes.get(game.tree.mainline[game.tree.mainline.length - 1])?.fen ?? game.tree.startFen
    saveText('position.fen', `${fen}\n`, 'text/plain')
  }

  /** Import the game into Lichess and open its analysis board (server analysis, explorer, sharing). */
  const analyseOnLichess = async () => {
    setLichessBusy(true)
    setLichessError(null)
    try {
      const { lichessToken, lichessPlayToken } = useSettingsStore.getState()
      const url = await lichessImportGame(treeToPgn(game.tree), lichessToken || lichessPlayToken || undefined)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setLichessError(e instanceof Error ? e.message : String(e))
    } finally {
      setLichessBusy(false)
    }
  }

  const goTo = (nodeId: string) => loadPosition(game.tree, nodeId, false)

  /** Put the board before the move and play the line on it, move by move. */
  function playLine(k: KeyMoment) {
    const node = game.tree.nodes.get(k.nodeId)
    if (!node) return
    const bad = k.quality === 'mistake' || k.quality === 'blunder'
    const from = bad ? node.parentId : k.nodeId
    loadPosition(game.tree, from, false)
    const startFen = from ? game.tree.nodes.get(from)!.fen : game.tree.startFen
    const chess = new Chess(startFen)
    const line = bad ? k.line : k.line.slice(1)
    line.forEach((san, i) => {
      let move
      try { move = chess.move(san) } catch { return }
      setTimeout(() => useStudyBoardStore.getState().playMove(move.from, move.to, startFen), 700 * (i + 1))
    })
  }

  function writeAnnotated(r: NonNullable<typeof reviewed>, human?: Record<number, LinkedHumanComment>) {
    return annotateGame(r.plies, r.review, { level, lang, white: players.white, black: players.black, layout, diagrams, ...(human ? { human } : {}) })
  }

  /**
   * The annotated game, with the remarks of the books on the same positions
   * when chosen in Settings and a commentary database can be asked (written at
   * once otherwise), each linked to where it comes from.
   */
  async function annotatedText(r = reviewed!): Promise<string> {
    if (!useSettingsStore.getState().humanComments || !hasCommentSource()) return writeAnnotated(r)
    const found = await humanCommentsWithLinks(r.plies, lang).catch(() => ({}))
    return writeAnnotated(r, Object.keys(found).length ? found : undefined)
  }

  /** The annotated game as a file (S34): Markdown, EPUB, PDF or HTML. */
  function downloadGame() {
    if (!reviewed) return
    const names = players.white && players.black ? `${players.white} – ${players.black}` : `${t.white} – ${t.black}`
    const save = (text: string) => downloadAnnotated(text, exportFormat, names, lang)
    // Written at once when no commentary database is asked.
    if (!useSettingsStore.getState().humanComments || !hasCommentSource()) return save(writeAnnotated(reviewed))
    void annotatedText(reviewed).then(save)
  }

  /**
   * Forget the review of the active game, run the engine again over it and
   * write its main line anew with the options selected here. In a library book
   * the new text replaces the game IN PLACE (kept per book, chapter and game,
   * restored from the game's marker, S3); the external book is opened anew.
   */
  const regenerate = () => withBusy(t.regenerate, async () => {
    useReviewStore.getState().forget(game.tree)
    await run([gameIndex])
    const fresh = useReviewStore.getState().byTree.get(game.tree)
    if (!fresh) return
    const humanComments = useSettingsStore.getState().humanComments && hasCommentSource()
    const body = await commentedGameText(fresh, games, gameIndex, text, { lang, level, layout, diagrams, humanComments })
    useStudyBoardStore.getState().clearGame()
    if (bookId !== EXTERNAL_BOOK_ID) {
      const store = useGameRewriteStore.getState()
      const previous = store.rewrites[rewriteKey(bookId, chapter)]?.[gameIndex]
      const layoutBefore = previous ? previous.layout : loadGameLayouts(bookId, chapter)[gameIndex]
      clearGameLayout(bookId, chapter, gameIndex)
      store.save(bookId, chapter, gameIndex, { text: body, ...(layoutBefore ? { layout: layoutBefore } : {}) })
      saveBoardMemory(bookId, { chapter, gameIndex, nodeId: null, annotations: {} })
      return
    }
    const { start, end } = gameLineRange(text, game)
    const rewritten = `${text.slice(0, start)}${body}${text.slice(end)}`
    const names = players.white && players.black ? `${players.white} – ${players.black}` : `${t.white} – ${t.black}`
    const { title, chapters } = textToChapters(rewritten, names)
    saveBoardMemory(EXTERNAL_BOOK_ID, { chapter: 1, gameIndex, nodeId: null, annotations: {} })
    saveProgress(EXTERNAL_BOOK_ID, 1)
    openBook(title, chapters)
    navigate(`/read/${EXTERNAL_BOOK_ID}`)
  })

  const openAnnotated = (r = reviewed) => withBusy(t.open, async () => {
    if (!r) return
    const names = players.white && players.black ? `${players.white} – ${players.black}` : `${t.white} – ${t.black}`
    const annotated = await annotatedText(r)
    const { title, chapters } = textToChapters(annotated, `${names} (${t.title.toLowerCase()})`)
    saveProgress(EXTERNAL_BOOK_ID, 1)
    openBook(title, chapters)
    navigate(`/read/${EXTERNAL_BOOK_ID}`)
  })

  function openCoach() {
    if (!reviewed) return
    const names = players.white && players.black ? `${players.white} – ${players.black}` : `${t.white} – ${t.black}`
    const { remarks, intro } = coachGame(reviewed.plies, reviewed.review, { focus, level, lang })
    const annotated = annotateGame(reviewed.plies, reviewed.review, { level: 2, lang, white: players.white, black: players.black, remarks, intro, layout, diagrams })
    const { title, chapters } = textToChapters(annotated, `${names} (${t.coach.split(':')[0].toLowerCase()})`)
    openBook(title, chapters)
    navigate(`/read/${EXTERNAL_BOOK_ID}`)
  }

  async function openAiAnnotated() {
    const model = configuredModel()
    if (!reviewed || !model) return
    setAiBusy(true)
    setAiError(null)
    try {
      const names = players.white && players.black ? `${players.white} – ${players.black}` : `${t.white} – ${t.black}`
      const annotated = await commentWithModel(model, { plies: reviewed.plies, review: reviewed.review, lang, white: players.white, black: players.black, layout, diagrams })
      const { title, chapters } = textToChapters(annotated, `${names} (${t.ai.toLowerCase()})`)
      openBook(title, chapters)
      navigate(`/read/${EXTERNAL_BOOK_ID}`)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(false)
    }
  }

  const button = 'rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  const chapterRecords = records.filter((r) => r.bookId === bookId && r.chapter === chapter)
  const bookRecords = records.filter((r) => r.bookId === bookId)
  const opening = reviewed ? openingName(reviewed.plies.map((p) => p.san), lang) : null
  const fromDatabase = database && database.tree === game.tree ? database : null

  const side = (color: 'white' | 'black') => {
    const r = reviewed!.review[color]
    return (
      <div
        data-testid={`accuracy-${color}`}
        data-accuracy={r.accuracy}
        className="flex-1 rounded border border-slate-200 bg-white px-2 py-1.5"
      >
        <p className="truncate text-xs font-semibold text-slate-800">
          {color === 'white' ? '♔' : '♚'} {players[color] ?? t[color]}
        </p>
        <p className="text-lg font-bold tabular-nums text-slate-900">
          {r.accuracy.toFixed(1)}% <span className="text-[11px] font-normal text-slate-500">{t.accuracy}</span>
        </p>
        <p className="text-[11px] leading-snug text-slate-600">
          {r.brilliant} {t.brilliant} · {r.good} {t.good} · {r.inaccuracies} {t.dubious} · {r.mistakes} {t.mistake} · {r.blunders} {t.blunder}
        </p>
      </div>
    )
  }

  const summary = (label: string, rows: typeof records, testId: string) =>
    rows.length > 0 && (
      <div data-testid={testId} className="mt-2 rounded border border-slate-200 bg-white px-2 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {label} · {rows.length} {t.games}
        </p>
        <ul className="mt-0.5 text-xs text-slate-700">
          {summarise(rows).map((p) => (
            <li key={p.name} className="flex justify-between gap-2">
              <span className="truncate">{p.name} <span className="text-slate-400">({p.games})</span></span>
              <span className="tabular-nums font-semibold">{p.accuracy.toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <section aria-label={t.title} className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-800">{t.title}</h3>
        <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-600">
          {t.depth}
          <select
            value={depth}
            onChange={(e) => setSettings({ reviewDepth: Number(e.target.value) })}
            className="rounded border border-slate-300 bg-white px-1 py-0.5"
          >
            {[8, 10, 12, 14, 16, 18].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {progress ? (
          <button className={button} onClick={() => abort.current?.abort()}>{t.cancel}</button>
        ) : (
          <>
            <button
              className="rounded border border-indigo-700 bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
              onClick={() => void run([gameIndex])}
            >
              {t.run}
            </button>
            {games.length > 1 && (
              <button className={button} onClick={() => void run(games.map((_, i) => i))}>{t.all}</button>
            )}
            <button className={button} onClick={() => void regenerate()}><span aria-hidden="true">⟳ </span>{t.regenerate}</button>
            <button className={button} onClick={downloadPgn}>{t.pgn}</button>
            <button className={button} onClick={downloadFen}>{t.fen}</button>
            <button className={button} disabled={lichessBusy} onClick={() => void analyseOnLichess()}>{t.lichess}<span aria-hidden="true"> ↗</span></button>
          </>
        )}
      </div>

      {lichessError && <p role="alert" className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{lichessError}</p>}
      {progress && (
        <div className="mt-2" role="status">
          <p className="text-[11px] text-slate-600">
            {t.analysing} {progress.done}/{progress.total}{games.length > 1 ? ` · ${progress.game + 1}/${games.length}` : ''}
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-200">
            <div className="h-full bg-indigo-500" style={{ width: `${(100 * progress.done) / progress.total}%` }} />
          </div>
        </div>
      )}

      {reviewed && (
        <>
          <div className="mt-2 flex gap-2">{side('white')}{side('black')}</div>
          {(opening || fromDatabase) && (
            <p className="mt-1 text-xs text-slate-600" data-testid="opening">
              {t.opening}: <strong>{fromDatabase ? `${fromDatabase.name} (${fromDatabase.eco})` : opening}</strong>
            </p>
          )}

          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-indigo-800">{t.moments}</p>
          {reviewed.review.keyMoments.length === 0 && <p className="text-xs text-slate-500">{t.none}</p>}
          <ul className="mt-1 flex flex-col gap-1">
            {reviewed.review.keyMoments.map((k) => {
              const label = `${k.moveNumber}${k.color === 'white' ? '.' : '...'} ${k.san.replace(/[!?]+$/, '')}`
              const bad = k.quality === 'mistake' || k.quality === 'blunder'
              const shown = bad ? k.line : k.line.slice(1)
              const next = k.color === 'white' ? { n: k.moveNumber, c: 'black' as const } : { n: k.moveNumber + 1, c: 'white' as const }
              return (
                <li key={k.nodeId} className={`rounded border px-2 py-1 text-xs ${TONE[k.quality]}`}>
                  <p className="font-semibold text-slate-800">
                    {label}{GLYPH[k.quality]}{' '}
                    <span className="font-normal text-slate-600">
                      ({k.swing > 0 ? '+' : ''}{k.swing.toFixed(0)}%)
                    </span>
                  </p>
                  {shown.length > 0 && (
                    <p className="text-slate-700">
                      {bad
                        ? `${t.better} ${numberLine(shown, k.moveNumber, k.color)}`
                        : `${t.follow} ${numberLine(shown, next.n, next.c)}`}
                    </p>
                  )}
                  <div className="mt-1 flex gap-1">
                    <button className={button} aria-label={`${t.go} ${label}`} onClick={() => goTo(k.nodeId)}>↪ {t.go} {label}</button>
                    {shown.length > 0 && <button className={button} onClick={() => playLine(k)}>▶ {t.line}</button>}
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-indigo-200 pt-2">
            <label className="flex items-center gap-1 text-[11px] text-slate-700">
              {t.level}
              <select
                aria-label={t.level}
                value={level}
                onChange={(e) => setLevel(Number(e.target.value) as 1 | 2 | 3)}
                className="rounded border border-slate-300 bg-white px-1 py-0.5"
              >
                <option value={1}>{t.l1}</option>
                <option value={2}>{t.l2}</option>
                <option value={3}>{t.l3}</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-700">
              {t.layout}
              <select
                aria-label={t.layout}
                value={layout}
                onChange={(e) => setSettings({ commentLayout: e.target.value as 'inline' | 'split' | 'paragraphs' })}
                className="rounded border border-slate-300 bg-white px-1 py-0.5"
              >
                <option value="inline">{t.inline}</option>
                <option value="split">{t.split}</option>
                <option value="paragraphs">{t.paragraphs}</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-700">
              <input type="checkbox" checked={keyDiagrams} onChange={(e) => setSettings({ commentDiagrams: e.target.checked })} />
              {t.diagrams}
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-700">
              <input type="checkbox" checked={diagramEval} onChange={(e) => setSettings({ commentDiagramEval: e.target.checked })} />
              {t.evalUnder}
            </label>
            <button
              className={button}
              disabled={!currentNodeId || !reviewed.plies.some((p) => p.nodeId === currentNodeId)}
              aria-pressed={!!currentNodeId && diagramAt.includes(currentNodeId)}
              onClick={() => currentNodeId && setDiagramAt(diagramAt.includes(currentNodeId) ? diagramAt.filter((x) => x !== currentNodeId) : [...diagramAt, currentNodeId])}
            >
              ▦ {t.diagramHere}{diagramAt.length ? ` (${diagramAt.length} ${t.diagramsChosen})` : ''}
            </button>
            <button className={button} onClick={() => void openAnnotated()}>{t.open}</button>
            <select aria-label={t.downloadFormat} value={exportFormat} onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px]">
              <option value="pdf">PDF</option>
              <option value="epub">EPUB</option>
              <option value="md">Markdown</option>
              <option value="html">HTML</option>
            </select>
            <button className={button} onClick={downloadGame}><span aria-hidden="true">⬇ </span>{t.download}</button>
            <label className="flex items-center gap-1 text-[11px] text-slate-700">
              {t.focus}
              <select aria-label={t.focus} value={focus} onChange={(e) => setFocus(e.target.value as 'white' | 'black' | 'both')}
                className="rounded border border-slate-300 bg-white px-1 py-0.5">
                <option value="white">{t.white}</option>
                <option value="black">{t.black}</option>
                <option value="both">{t.focusBoth}</option>
              </select>
            </label>
            <button className={button} onClick={openCoach}>🎓 {t.coach}</button>
            <button className={button} onClick={() => void openAiAnnotated()} disabled={!aiReady || aiBusy} title={aiReady ? undefined : t.aiSetup}>
              {aiBusy ? t.aiBusy : `✨ ${t.ai}`}
            </button>
          </div>
          {!aiReady && <p className="mt-1 text-[11px] text-slate-500">{t.aiSetup}</p>}
          {aiError && <p role="alert" className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{aiError}</p>}
        </>
      )}

      {summary(t.chapter, chapterRecords, 'chapter-summary')}
      {summary(t.book, bookRecords, 'book-summary')}
      {(chapterRecords.length > 0 || reviewed) && !players.white && !players.black && (
        <p className="mt-1 text-[11px] text-slate-500">{t.players}</p>
      )}
    </section>
  )
}

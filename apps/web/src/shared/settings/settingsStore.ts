import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultBaseUrl, isLlmProvider, type LlmProvider } from '../llm/types'

// Board color themes
/** The private resources repository (books, commentary and game databases); readable with a GitHub token. */
export const DEFAULT_RESOURCES_URL = 'https://github.com/patchamama/chessreader-resources'

export type BoardTheme =
  | 'classic'   // brown / beige
  | 'blue'      // steel blue
  | 'green'     // green felt
  | 'purple'    // purple
  | 'gray'      // monochrome
  | 'coral'     // coral / cream

export const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string; label: string }> = {
  classic: { light: '#f0d9b5', dark: '#b58863', label: 'Classic' },
  blue:    { light: '#dee3e6', dark: '#5a80a7', label: 'Blue' },
  green:   { light: '#ffffdd', dark: '#86a666', label: 'Green' },
  purple:  { light: '#e8d9f0', dark: '#8e55a0', label: 'Purple' },
  gray:    { light: '#e0e0e0', dark: '#7a7a7a', label: 'Gray' },
  coral:   { light: '#fef0e6', dark: '#cc7755', label: 'Coral' },
}

export type EvalBarDirection = 'horizontal' | 'vertical'

/** Where engine lines come from: the local Stockfish, or the Lichess cloud first (local only when the cloud does not know the position). */
export type EngineSource = 'local' | 'lichess-cloud'

export type CommentSourcePriority = 'books' | 'lichess' | 'both'

export type StockfishVersion = 'sf18-local' | 'sf10-jsdelivr' | 'sf16-jsdelivr' | 'sf10-cdnjs' | 'sf9-cdnjs'

export const STOCKFISH_VERSIONS: Record<StockfishVersion, { url: string; label: string }> = {
  'sf18-local': {
    // Served by this site (see vite.config.ts): the CDNs refuse the package.
    url: `${import.meta.env.BASE_URL ?? '/'}stockfish/stockfish-18-lite-single.js`,
    label: 'Stockfish 18 lite (this site)',
  },
  'sf10-jsdelivr': {
    url: 'https://cdn.jsdelivr.net/npm/stockfish.js@10/stockfish.js',
    label: 'Stockfish 10 (jsDelivr)',
  },
  'sf16-jsdelivr': {
    url: 'https://cdn.jsdelivr.net/npm/stockfish@16/src/stockfish-nnue-16-single.js',
    label: 'Stockfish 16 (jsDelivr)',
  },
  'sf10-cdnjs': {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js',
    label: 'Stockfish 10 (cdnjs)',
  },
  'sf9-cdnjs': {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/9.0/stockfish.js',
    label: 'Stockfish 9 (cdnjs)',
  },
}

export type FontFamily = 'serif' | 'sans' | 'mono'
export const FONT_FAMILIES: Record<FontFamily, { css: string; label: string }> = {
  serif: { css: 'Georgia, Times New Roman, serif', label: 'Serif' },
  sans:  { css: 'Inter, system-ui, sans-serif',    label: 'Sans-serif' },
  mono:  { css: 'JetBrains Mono, Courier New, monospace', label: 'Monospace' },
}

export type ImageAlign = 'left' | 'center' | 'right'

export interface HeadingStyle {
  bold: boolean
  italic: boolean
  sizeDelta: number   // relative px offset from base font size (-4..+16)
}

export interface EpubLayout {
  h1: HeadingStyle
  h2: HeadingStyle
  h3: HeadingStyle
  h4: HeadingStyle
  h5: HeadingStyle
  paragraphSpacing: number   // rem between <p> tags (0–4)
  paragraphIndent: number    // rem text-indent for first line (0–4)
  imageAlign: ImageAlign
}

export type EngineVariations = 1 | 2 | 3

export type AppTheme = 'light' | 'dark'

export const APP_THEME_PRESETS: Record<AppTheme, { bgColor: string; textColor: string; label: string }> = {
  light: { bgColor: '#ffffff', textColor: '#1a1a1a', label: 'Light' },
  dark:  { bgColor: '#1a1a1a', textColor: '#e8e8e8', label: 'Dark'  },
}

export type PieceTheme =
  | 'default'
  | 'alpha'
  | 'merida'
  | 'leipzig'
  | 'maestro'
  | 'fantasy'
  | 'cardinal'
  | 'staunty'

export const PIECE_THEMES: Record<PieceTheme, { label: string }> = {
  default:  { label: 'Default'  },
  alpha:    { label: 'Alpha'    },
  merida:   { label: 'Merida'   },
  leipzig:  { label: 'Leipzig'  },
  maestro:  { label: 'Maestro'  },
  fantasy:  { label: 'Fantasy'  },
  cardinal: { label: 'Cardinal' },
  staunty:  { label: 'Staunty'  },
}

export type AppLanguage = 'es' | 'en' | 'de'
export const APP_LANGUAGES: Record<AppLanguage, string> = { es: 'Español', en: 'English', de: 'Deutsch' }

/** Language of the browser when it is one the app speaks (English otherwise). */
export function browserLanguage(): AppLanguage {
  const code = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase()
  return code === 'es' || code === 'de' ? code : 'en'
}

/** How pieces are written in notation: figurines (♞f3) or the letters of the language (Cf3, Sf3, Nf3). */
export type NotationStyle = 'figurine' | 'letters'
export const NOTATION_STYLES: Record<NotationStyle, string> = { letters: 'Letters of the language (Cf3, Sf3, Nf3)', figurine: 'Figurines (♞f3)' }

export type VoiceProvider = 'browser' | 'system' | 'piper' | 'openai' | 'elevenlabs'

export interface AppSettings {
  /** Language of the commentary the app writes and of the narration voice. */
  language: AppLanguage
  /** Pieces in every notation shown: figurines or the letters of `language`. */
  notationStyle: NotationStyle
  /** Narration: say "White:" / "Black:" before every move. */
  narrationSayColor: boolean
  /** Narration: say the move number on White's moves, on both sides' or never. */
  narrationSayNumber: 'white' | 'both' | 'none'
  /** Narration, "I move" mode: seconds before an unanswered move is announced again (0 = never). */
  narrationRepeatSeconds: number
  /** Selecting a piece colours its destinations by how good each move is. */
  moveHints: boolean
  /** The analysis board lists the database comments of the position shown, each one editable. */
  analysisComments: boolean
  /** Engine depth used to review a whole game. */
  reviewDepth: number
  /** Who speaks: the browser (live only) or a server voice (can be saved as MP3). */
  voiceProvider: VoiceProvider
  /** Voice name or id for the server provider (empty = its default). */
  voiceName: string
  /** Voice of the browser, by name (empty = the first one for the language). */
  browserVoice: string
  voiceRate: number
  /** Model of the provider, when it has several (empty = default). */
  voiceModel: string
  /** Keys of paid providers. Kept in this browser only; sent with each render request. */
  openaiKey: string
  elevenlabsKey: string
  /** The AI assistant: language model service ('none' = off; commentary is then rule-based only). */
  aiProvider: 'none' | LlmProvider
  /** Its API root (prefilled per provider; Anthropic always uses its own). */
  aiBaseUrl: string
  /** Its API key (kept in this browser; sent to the provider, or with each request to the app's own server) and model id. */
  aiKey: string
  aiModel: string
  /** Whether the model read the probe image of the last Test (null = not tested). */
  aiVision: boolean | null
  /** Scroll the book so the move being played or narrated stays centred. */
  autoscroll: boolean
  /** Seconds of silence after each game move the narration says (live and in the MP3). */
  narrationMovePause: number
  /** How an annotated game is written: remarks in braces, lines split at each remark, or runs of moves followed by a paragraph. */
  commentLayout: 'inline' | 'split' | 'paragraphs'
  /** Diagrams in an annotated game at its key moments, with the engine evaluation under them. */
  commentDiagrams: boolean
  commentDiagramEval: boolean
  /** Lichess token with the board:play permission (playing from this board). Kept in this browser. */
  lichessPlayToken: string
  /** Personal Lichess token (the masters explorer needs one). Kept in this browser, sent only to Lichess. */
  lichessToken: string
  boardTheme: BoardTheme
  evalBarDirection: EvalBarDirection
  stockfishVersion: StockfishVersion
  engineSource: EngineSource
  /** Play: colour the destinations of the selected piece by how good each move is. */
  /** The thumbnail of a hovered move shows the engine's evaluation, the loss and the engine's move. */
  hintEval: boolean
  /** chess.com user name (its API is public and read-only: games and ratings, no play). */
  chessComUser: string
  /** Desktop page width: normal, wide or the whole window. */
  pageWidth: 'normal' | 'wide' | 'full'
  /** Joins the lines of a chapter title written over several lines ("Capítulo dos - Emanuel II"). */
  chapterTitleSeparator: string
  /** The status bar at the bottom of the window. */
  statusFooter: boolean
  /** Human commentary database: a public base URL, or a GitHub contents API URL of a private repository. */
  commentDbUrl: string
  /** Token for a private commentary database (GitHub fine-grained token, contents:read). Kept in this browser. */
  commentDbToken: string
  /** Token that can write to the resources repository (contents:write), for saving suggestions. Sent only to api.github.com. */
  resourcesWriteToken: string
  /** Example books of the demo the reader closed (✕); Settings shows them again. */
  hiddenExamples: number[]
  /** Borrow book remarks on the same position when writing an annotated game. */
  humanComments: boolean
  /** Which remarks to borrow first for an annotated game: those of books, of Lichess studies, or either (the reader's language first). */
  commentSourcePriority: CommentSourcePriority
  /** Translate (after standardising) a borrowed remark the database has no text for in the reader's language, with the AI assistant. */
  translateMissingComments: boolean
  /** With a non-local AI assistant, standardise a borrowed remark that has no normalized text while commenting a game (saved as a pending suggestion). */
  normalizeWhileCommenting: boolean
  /** Book diagrams: show the engine's evaluation under each (when it has one). */
  diagramEvalShow: boolean
  /** Book diagrams: an evaluation bar above the evaluation. */
  diagramEvalBar: boolean
  /** Book diagrams: hovering a move of the engine line shows its position. */
  diagramEvalThumbs: boolean
  diagramEvalDepth: number
  /** How many lines the engine gives for a diagram: the best and the alternatives. */
  diagramEvalLines: number
  playMoveHints: boolean
  /** Play: say after each move whether it was book, best, good, an inaccuracy, a mistake or a blunder. */
  playMoveStatus: boolean
  /** Play: show the evaluation bar beside the board. */
  playEvalBar: boolean
  /** Play: show the legend of the hint colours during the first moves. */
  playLegend: boolean
  /** Play: say the moves aloud — none, only the opponent's, or both sides'. */
  playVoice: 'none' | 'opponent' | 'both'
  /** Play: on my turn, what a player of my rating would play (Maia on the server). */
  /** Play: ideas on my turn — the opening, the opponent's weak points, my chances. */
  playIdeas: boolean
  playHumanHint: boolean
  playHumanRating: number
  /** Master switch: ON → engine runs, eval panel + best-move arrow shown. */
  showEval: boolean
  /** Target search depth (plies). Progressive analysis ramps up to this value. */
  engineDepth: number
  /** Number of principal variations to compute (MultiPV), 1–3. */
  engineVariations: EngineVariations
  /** Show the engine best-move arrow while the engine is active. */
  showEngineArrow: boolean
  fontFamily: FontFamily
  fontSize: number        // 12–22 px
  bgColor: string         // hex
  textColor: string       // hex
  marginH: number         // horizontal padding rem (0–6)
  epub: EpubLayout
  /** Light/dark preset selector for bg/text colors. */
  appTheme: AppTheme
  /** Piece sprite set. */
  pieceTheme: PieceTheme
  /** Width in px of the study-board side panel (drag-resizable). */
  studyPanelWidth: number
  /** Show file/rank coordinate labels (a–h / 1–8). */
  showBoardLabels: boolean
  /** Tint the whole last-move square instead of a subtle dot. */
  fullSquareHighlight: boolean
  /** Play a short sound when navigating moves. */
  playMoveSound: boolean
  /** Delay in seconds between autoplayed moves. */
  autoplayDelay: number
  /** Move-recognition algorithm: 1 = mainline only, 2 = two-pass, 3 = legacy. */
  /** How books are read: 1 = main line only, 2 = with variations (the legacy 3 is gone). */
  recognitionAlgorithm: 1 | 2
  /** Board color theme used when regenerating book diagram images. */
  diagramBoardTheme: BoardTheme
  /** Piece set used when regenerating book diagram images. */
  diagramPieceTheme: PieceTheme
  /** Draw file/rank coordinate symbols on regenerated book diagrams. */
  diagramCoordinates: boolean
}

const DEFAULT_EPUB: EpubLayout = {
  h1: { bold: true,  italic: false, sizeDelta: 10 },
  h2: { bold: true,  italic: false, sizeDelta: 6  },
  h3: { bold: true,  italic: false, sizeDelta: 3  },
  h4: { bold: true,  italic: false, sizeDelta: 1  },
  h5: { bold: false, italic: true,  sizeDelta: 0  },
  paragraphSpacing: 1,
  paragraphIndent: 1.5,
  imageAlign: 'center',
}

const DEFAULT: AppSettings = {
  language: browserLanguage(),
  notationStyle: 'letters',
  narrationSayColor: false,
  narrationSayNumber: 'white',
  narrationRepeatSeconds: 5,
  moveHints: true,
  analysisComments: false,
  reviewDepth: 14,
  voiceProvider: 'browser',
  voiceName: '',
  browserVoice: '',
  voiceRate: 1,
  voiceModel: '',
  openaiKey: '',
  elevenlabsKey: '',
  aiProvider: 'none',
  aiBaseUrl: '',
  aiKey: '',
  aiModel: '',
  aiVision: null,
  lichessToken: '',
  lichessPlayToken: '',
  commentLayout: 'split',
  autoscroll: true,
  narrationMovePause: 0,
  commentDiagrams: true,
  commentDiagramEval: true,
  boardTheme: 'blue',
  evalBarDirection: 'vertical',
  stockfishVersion: 'sf18-local',
  engineSource: 'local',
  hintEval: true,
  chessComUser: '',
  pageWidth: 'normal',
  chapterTitleSeparator: ' - ',
  statusFooter: true,
  commentDbUrl: DEFAULT_RESOURCES_URL,
  commentDbToken: '',
  resourcesWriteToken: '',
  hiddenExamples: [],
  humanComments: true,
  commentSourcePriority: 'books',
  translateMissingComments: false,
  normalizeWhileCommenting: true,
  diagramEvalShow: true,
  diagramEvalBar: false,
  diagramEvalThumbs: true,
  diagramEvalDepth: 16,
  diagramEvalLines: 3,
  playMoveHints: true,
  playMoveStatus: true,
  playEvalBar: false,
  playLegend: true,
  playVoice: 'none',
  playIdeas: true,
  playHumanHint: false,
  playHumanRating: 1500,
  showEval: true,
  engineDepth: 30,
  engineVariations: 1,
  showEngineArrow: true,
  fontFamily: 'serif',
  fontSize: 16,
  bgColor: '#ffffff',
  textColor: '#1a1a1a',
  marginH: 2,
  epub: DEFAULT_EPUB,
  appTheme: 'light',
  pieceTheme: 'default',
  studyPanelWidth: 320,
  showBoardLabels: true,
  fullSquareHighlight: true,
  playMoveSound: true,
  autoplayDelay: 1,
  recognitionAlgorithm: 2,
  diagramBoardTheme: 'classic',
  diagramPieceTheme: 'merida',
  diagramCoordinates: false,
}

interface SettingsStore extends AppSettings {
  set: (patch: Partial<AppSettings>) => void
  /** Switch app theme AND apply its bg/text color preset in one shot. */
  applyAppTheme: (theme: AppTheme) => void
  reset: () => void
}

/**
 * Merge persisted state over the current (default-seeded) state so any setting
 * added after a user first saved — e.g. `showEngineArrow` — keeps its default
 * instead of hydrating as `undefined`. Defaults first, persisted values on top.
 */
export function mergeWithDefaults(
  current: SettingsStore,
  persisted: unknown,
): SettingsStore {
  const merged = { ...current, ...(persisted as Partial<SettingsStore> | undefined) }
  // A missing or unknown notation (older or hand-edited state) falls back to the default.
  if (!(merged.notationStyle in NOTATION_STYLES)) merged.notationStyle = DEFAULT.notationStyle
  if (merged.aiProvider !== 'none' && !isLlmProvider(merged.aiProvider)) merged.aiProvider = 'none'
  return merged
}

/**
 * Saved settings of an older version. Version 1 (v0.64): annotated games are
 * laid out like a book — moves split at each remark, diagrams with their
 * evaluation — also for readers who had kept the old defaults.
 */
export function migrateSettings(persisted: unknown, version: number): Partial<SettingsStore> {
  const s = { ...(persisted as Partial<SettingsStore> | undefined) }
  // Version 3: the private resources repository is the default source.
  if (version < 3 && !s.commentDbUrl) s.commentDbUrl = DEFAULT_RESOURCES_URL
  // Version 4: a square named in the text is always shown on a hover thumbnail.
  if (version < 4) delete (s as Record<string, unknown>).mentionPreview
  // Version 5: the AI assistant has a base URL per provider and remembers whether the model can see.
  if (version < 5) {
    if (isLlmProvider(s.aiProvider) && !s.aiBaseUrl) s.aiBaseUrl = defaultBaseUrl(s.aiProvider)
    s.aiVision = null
  }
  // Version 6: borrowed remarks come from books first; missing translations are not made unasked.
  if (version < 6) {
    s.commentSourcePriority ??= 'books'
    s.translateMissingComments ??= false
  }
  // Version 7: standardise borrowed remarks while commenting (non-local assistants only).
  if (version < 7) s.normalizeWhileCommenting ??= true
  if (version < 1) Object.assign(s, { commentLayout: 'split', commentDiagrams: true, commentDiagramEval: true })
  if (version < 2) {
    // The legacy recogniser (3) is retired: read with variations instead.
    if ((s.recognitionAlgorithm as number) === 3) s.recognitionAlgorithm = 2
    // One Lichess token for everything: keep whichever was set.
    if (!s.lichessToken && s.lichessPlayToken) s.lichessToken = s.lichessPlayToken
  }
  return s
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT,
      set: (patch) => set((s) => ({ ...s, ...patch })),
      applyAppTheme: (theme) =>
        set((s) => ({
          ...s,
          appTheme: theme,
          bgColor: APP_THEME_PRESETS[theme].bgColor,
          textColor: APP_THEME_PRESETS[theme].textColor,
        })),
      reset: () => set({ ...DEFAULT }),
    }),
    {
      name: 'chessreader-settings',
      version: 7,
      migrate: (persisted, version) => migrateSettings(persisted, version) as SettingsStore,
      merge: (persisted, current) => mergeWithDefaults(current as SettingsStore, persisted),
    },
  ),
)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Board color themes
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

export type VoiceProvider = 'browser' | 'system' | 'piper' | 'openai' | 'elevenlabs'

export interface AppSettings {
  /** Language of the commentary the app writes and of the narration voice. */
  language: AppLanguage
  /** Narration: say "White:" / "Black:" before every move. */
  narrationSayColor: boolean
  /** Narration: say the move number on White's moves, on both sides' or never. */
  narrationSayNumber: 'white' | 'both' | 'none'
  /** Narration, "I move" mode: seconds before an unanswered move is announced again (0 = never). */
  narrationRepeatSeconds: number
  /** Selecting a piece colours its destinations by how good each move is. */
  moveHints: boolean
  /** A square named in the text: show it on the main board at that point of the game, or in a hover thumbnail. */
  mentionPreview: 'board' | 'thumbnail'
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
  /** Language model that writes commentary from the engine review ('none' = rule-based only). */
  aiProvider: 'none' | 'anthropic' | 'openai'
  /** Its API key (kept in this browser, sent only to that provider) and model id. */
  aiKey: string
  aiModel: string
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
  /** Human commentary database: a public base URL, or a GitHub contents API URL of a private repository. */
  commentDbUrl: string
  /** Token for a private commentary database (GitHub fine-grained token, contents:read). Kept in this browser. */
  commentDbToken: string
  /** Borrow book remarks on the same position when writing an annotated game. */
  humanComments: boolean
  /** Book diagrams: show the engine's evaluation under each (when it has one). */
  diagramEvalShow: boolean
  /** Book diagrams: an evaluation bar above the evaluation. */
  diagramEvalBar: boolean
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
  recognitionAlgorithm: 1 | 2 | 3
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
  narrationSayColor: false,
  narrationSayNumber: 'white',
  narrationRepeatSeconds: 5,
  moveHints: true,
  mentionPreview: 'board',
  reviewDepth: 14,
  voiceProvider: 'browser',
  voiceName: '',
  browserVoice: '',
  voiceRate: 1,
  voiceModel: '',
  openaiKey: '',
  elevenlabsKey: '',
  aiProvider: 'none',
  aiKey: '',
  aiModel: '',
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
  commentDbUrl: '',
  commentDbToken: '',
  humanComments: true,
  diagramEvalShow: true,
  diagramEvalBar: false,
  diagramEvalDepth: 16,
  diagramEvalLines: 3,
  playMoveHints: true,
  playMoveStatus: true,
  playEvalBar: false,
  playLegend: true,
  playVoice: 'none',
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
  return { ...current, ...(persisted as Partial<SettingsStore> | undefined) }
}

/**
 * Saved settings of an older version. Version 1 (v0.64): annotated games are
 * laid out like a book — moves split at each remark, diagrams with their
 * evaluation — also for readers who had kept the old defaults.
 */
export function migrateSettings(persisted: unknown, version: number): Partial<SettingsStore> {
  const s = { ...(persisted as Partial<SettingsStore> | undefined) }
  if (version < 1) Object.assign(s, { commentLayout: 'split', commentDiagrams: true, commentDiagramEval: true })
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
      version: 1,
      migrate: (persisted, version) => migrateSettings(persisted, version) as SettingsStore,
      merge: (persisted, current) => mergeWithDefaults(current as SettingsStore, persisted),
    },
  ),
)

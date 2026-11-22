import { positionHash, positionKey, type RecognizedGame } from '@chess-ebook/chess-shared'
import type { LlmRequest, LlmResult } from '../../../shared/llm'
import { parseAiText, translatePrompt, validateRewrite, type TargetLang } from '../../comments/commentPrompts'
import { gameLineRange } from '../utils/gameRewrite'

export type Complete = (request: LlmRequest) => Promise<LlmResult>

/** One line of a game's text: the moves (kept as they are) or a comment (translated on its own). */
export interface GameLine {
  kind: 'moves' | 'comment'
  text: string
  /** Comment lines: the position it follows and the move that led to it ("" before the first move). */
  fen: string
  move: string
  ply: number
  san: string
}

/** The `san` the commentary database gives a comment printed before a game's first move (ply 0). */
export const INTRO_SAN = '@intro'

const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** A comment line is only a comment when it is real prose: this long at least. */
const LEADING_MIN = 40

/**
 * The lines of a game: from the comments printed before its first move (the
 * text of a Lichess chapter opens with one) to the end of its last move. A
 * comment line carries the position that it follows, to give the model context.
 * `after` is where the previous game ends, so its text is never taken.
 */
export function gameTranslationUnits(
  text: string,
  game: RecognizedGame,
  startFen: string,
  after = 0,
): { lines: GameLine[]; leading: number } {
  const range = gameLineRange(text, game)
  let start = range.start
  let leading = 0
  while (start > after) {
    const from = text.lastIndexOf('\n', start - 2) + 1
    const line = text.slice(from, start - 1)
    if (from < after || line.trim().length < LEADING_MIN) break
    start = from
    leading++
  }
  const main = game.tree.mainline.map((id) => game.tree.nodes.get(id)).filter((n) => n !== undefined)
  const starts = main.map((n) => n.charStart).filter((n): n is number => n !== undefined)
  const lines: GameLine[] = []
  let at = start
  for (const raw of text.slice(start, range.end).split('\n')) {
    const from = at
    at += raw.length + 1
    if (!raw.trim()) continue
    const to = from + raw.length
    if (starts.some((s) => s >= from && s < to)) {
      lines.push({ kind: 'moves', text: raw.trim(), fen: '', move: '', ply: 0, san: '' })
      continue
    }
    const before = [...main].reverse().find((n) => n.charEnd !== undefined && n.charEnd <= from)
    const ply = before ? main.indexOf(before) + 1 : 0
    lines.push({
      kind: 'comment', text: raw.trim(), fen: before?.fen ?? startFen, ply, san: before?.san ?? '',
      move: before ? `${before.moveNumber}${before.color === 'white' ? '. ' : '...'}${before.san}`.replace('. ', '.') : '',
    })
  }
  return { lines, leading }
}

/** The game as a PGN: moves as they are, each comment in braces, the starting position when it is not the usual one. */
function linesToPgn(parts: string[], lines: GameLine[], startFen: string): string {
  const head = startFen && startFen !== STANDARD_FEN ? `[SetUp "1"]\n[FEN "${startFen}"]\n\n` : ''
  return head + parts.map((p, i) => (lines[i]?.kind === 'moves' ? p : `{ ${p} }`)).join(' ')
}

/** The game as the book prints it, as a PGN: what identifies it in the commentary database. */
export function originalGamePgn(text: string, game: RecognizedGame, startFen: string, after = 0): string {
  const { lines } = gameTranslationUnits(text, game, startFen, after)
  return linesToPgn(lines.map((l) => l.text), lines, startFen)
}

export interface TranslatedComment {
  original: string
  /** null when the model failed or lost a move: the original stays. */
  translated: string | null
  hash: string
  key: string
  ply: number
  move: number
  san: string
}

export interface GameTranslation {
  /** The game's text with its comments translated (lines joined by newlines). */
  text: string
  /** Lines before the first move that belong to the text (see gameTranslationUnits). */
  leading: number
  /** The game as a PGN (comments in braces), translated and as written in the book. */
  pgn: string
  originalPgn: string
  comments: TranslatedComment[]
  problems: string[]
}

export interface TranslateOptions {
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  /** Where the previous game ends. */
  after?: number
}

/**
 * Translate the comments of a game, each one on its own with the chess prompt
 * (its position and move as context). Move lines are never sent to the model.
 * A comment the model cannot translate faithfully keeps its original.
 */
export async function translateGameText(
  complete: Complete, text: string, game: RecognizedGame, target: TargetLang, startFen: string, options: TranslateOptions = {},
): Promise<GameTranslation> {
  const { lines, leading } = gameTranslationUnits(text, game, startFen, options.after ?? 0)
  const total = lines.filter((l) => l.kind === 'comment').length
  const comments: TranslatedComment[] = []
  const problems: string[] = []
  const out: string[] = []
  let done = 0
  for (const line of lines) {
    if (line.kind === 'moves') { out.push(line.text); continue }
    if (options.signal?.aborted) throw new DOMException('Translation cancelled', 'AbortError')
    let translated: string | null = null
    try {
      const result = await complete(translatePrompt({ text: line.text, lang: '', fen: line.fen, move: line.move }, target))
      const candidate = parseAiText(result.text)
      const issues = validateRewrite(line.text, candidate)
      if (issues.length) problems.push(`${line.move || 'start'}: ${issues.join('; ')}`)
      else translated = candidate
    } catch (e) {
      if (options.signal?.aborted) throw e
      problems.push(`${line.move || 'start'}: ${(e as Error).message}`)
    }
    out.push(translated ?? line.text)
    comments.push({
      original: line.text, translated, hash: positionHash(line.fen), key: positionKey(line.fen),
      ply: line.ply, move: line.ply === 0 ? 0 : Math.ceil(line.ply / 2), san: line.ply === 0 ? INTRO_SAN : line.san,
    })
    options.onProgress?.(++done, total)
  }
  return {
    text: out.join('\n'), leading, comments, problems,
    pgn: linesToPgn(out, lines, startFen), originalPgn: linesToPgn(lines.map((l) => l.text), lines, startFen),
  }
}

import type { LlmRequest } from '../../shared/llm'

/**
 * The prompts of the AI actions on the commentary database (S3): make a
 * comment universal, translate a comment, translate the comments of a game.
 * Every prompt has a fixed structure and asks for a JSON answer; the answer is
 * validated before it is offered (not empty, not much longer, every move kept).
 */

export const TARGET_LANGS = ['es', 'en', 'de', 'fr'] as const
export type TargetLang = (typeof TARGET_LANGS)[number]

const LANGS: Record<TargetLang, { name: string; pieces: string }> = {
  en: { name: 'English', pieces: 'K, Q, R, B, N (English SAN)' },
  es: { name: 'Spanish', pieces: 'R (rey), D (dama), T (torre), A (alfil), C (caballo)' },
  de: { name: 'German', pieces: 'K (König), D (Dame), T (Turm), L (Läufer), S (Springer)' },
  fr: { name: 'French', pieces: 'R (roi), D (dame), T (tour), F (fou), C (cavalier)' },
}
export const langName = (lang: string) => LANGS[lang as TargetLang]?.name ?? lang

export interface PromptComment {
  text: string
  lang: string
  /** The position the comment is about. */
  fen: string
  /** The move that led to it, e.g. "12...Nb6". */
  move: string
}

const JSON_TEXT = 'Answer with JSON only, exactly {"text": "<the new comment>"}, and nothing else.'

const KEEP_MOVES = 'Keep every move the comment mentions (e.g. 13. Bxe6, Qh4+, O-O) and its chess meaning; write the moves in the piece letters of the language of the answer, or keep figurines when the comment uses them. Do not add moves, evaluations or facts that are not in the comment.'

const commentMessage = (c: PromptComment) =>
  `Position (FEN): ${c.fen}\nLast move: ${c.move}\nComment (${langName(c.lang)}):\n${c.text}`

/** Rewrite a comment so that it applies to any game reaching the position. */
export function universalPrompt(c: PromptComment): LlmRequest {
  return {
    system: [
      'You edit chess commentary.',
      'Rewrite the comment so that it applies to any game that reaches this position, not only to the game or book it was taken from.',
      'Use no player names, no references to the book, the chapter, the game, the tournament or other games; speak of White and Black.',
      `Keep the chess content and write in the language of the comment (${langName(c.lang)}).`,
      KEEP_MOVES,
      JSON_TEXT,
    ].join('\n'),
    messages: [{ role: 'user', text: commentMessage(c) }],
    json: true,
  }
}

/** Translate a comment into a language, with that language's piece letters. */
export function translatePrompt(c: PromptComment, target: TargetLang): LlmRequest {
  const t = LANGS[target]
  return {
    system: [
      'You translate chess commentary.',
      `Translate the comment into ${t.name}, faithfully and naturally, as a chess author writing in ${t.name} would.`,
      `Write the moves with the ${t.name} piece letters: ${t.pieces}. Keep figurines as they are.`,
      KEEP_MOVES,
      JSON_TEXT,
    ].join('\n'),
    messages: [{ role: 'user', text: commentMessage(c) }],
    json: true,
  }
}

/** Translate every {comment} of a game; the moves themselves are never sent back. */
export function translateGamePrompt(comments: string[], target: TargetLang): LlmRequest {
  const t = LANGS[target]
  return {
    system: [
      'You translate the comments of an annotated chess game.',
      `Translate each comment into ${t.name}. Write the moves inside them with the ${t.name} piece letters: ${t.pieces}. Keep figurines as they are.`,
      KEEP_MOVES,
      `Answer with JSON only, exactly {"comments": ["…", …]}: the same number of comments (${comments.length}), in the same order.`,
    ].join('\n'),
    messages: [{ role: 'user', text: `Comments of the game, in order:\n${JSON.stringify({ comments })}` }],
    json: true,
  }
}

function parseJson(answer: string): Record<string, unknown> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(answer)
  const raw = (fenced ? fenced[1] : answer).trim()
  const start = raw.indexOf('{')
  try {
    const value = JSON.parse(start >= 0 ? raw.slice(start, raw.lastIndexOf('}') + 1) : raw) as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch { /* below */ }
  throw new Error('The model did not answer with JSON.')
}

/** The text of a {"text": …} answer. */
export function parseAiText(answer: string): string {
  const text = parseJson(answer).text
  if (typeof text !== 'string' || !text.trim()) throw new Error('The model gave an empty comment.')
  return text.trim()
}

/** The comments of a {"comments": […]} answer, as many as asked for. */
export function parseAiComments(answer: string, count: number): string[] {
  const list = parseJson(answer).comments
  if (!Array.isArray(list) || list.length !== count || list.some((c) => typeof c !== 'string')) throw new Error(`The model did not return ${count} comments.`)
  return (list as string[]).map((c) => c.trim())
}

const PIECE = 'KQRBNSLTDACF♔♕♖♗♘♙♚♛♜♝♞♟'
const MOVE_RE = new RegExp(`(?<![\\p{L}\\d])(?:([O0]-[O0]-[O0])|([O0]-[O0])|([${PIECE}])?([a-h]?[1-8]?)([x:×])?([a-h][1-8])(=?[${PIECE}]|=)?)[+#]?[!?]*(?![\\p{L}\\d])`, 'gu')

/**
 * The moves of a text as language-free keys: piece or pawn, capture, target
 * square and promotion ("Nb6" and "Cb6" and "♘b6" are all "Pb6"; "dxe5" is
 * "pxe5"; castling is "O-O"/"O-O-O"). Enough to see a move survive a translation.
 */
export function moveKeys(text: string): string[] {
  return [...text.matchAll(MOVE_RE)].map((m) =>
    m[1] ? 'O-O-O' : m[2] ? 'O-O' : `${m[3] ? 'P' : 'p'}${m[5] ? 'x' : ''}${m[6]}${m[7] ? '=' : ''}`)
}

/** The problems of a rewritten comment; [] when it may be offered. */
export function validateRewrite(original: string, proposal: string): string[] {
  const problems: string[] = []
  const text = proposal.trim()
  if (!text) return ['the proposal is empty']
  if (text.length > 3 * Math.max(original.trim().length, 1)) problems.push('the proposal is more than 3 times longer than the original')
  const kept = new Set(moveKeys(text))
  const missing = [...original.matchAll(MOVE_RE)].filter((m) => !kept.has(moveKeys(m[0])[0])).map((m) => m[0])
  if (missing.length) problems.push(`moves missing from the proposal: ${[...new Set(missing)].join(', ')}`)
  return problems
}

const BRACES = /\{([^}]*)\}/g

/** The {comments} of a PGN, in order. */
export const gameCommentsOf = (pgn: string): string[] => [...pgn.matchAll(BRACES)].map((m) => m[1].trim())

/** The PGN with its {comments} replaced in order; everything else (the moves) as it was. */
export function replaceGameComments(pgn: string, comments: string[]): string {
  const count = gameCommentsOf(pgn).length
  if (comments.length !== count) throw new Error(`The game has ${count} comments, ${comments.length} were given.`)
  let i = 0
  return pgn.replace(BRACES, () => `{${comments[i++].replace(/[{}]/g, '')}}`)
}

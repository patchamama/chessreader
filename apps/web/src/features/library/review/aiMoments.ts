import { reviewGame } from '@chess-ebook/chess-shared'
import type { LlmRequest, LlmResult } from '../../../shared/llm'
import { langName, moveKeys } from '../../comments/commentPrompts'
import {
  describeEnding, describePattern, materialByPly, momentFacts, moverScoreText,
  type MomentFacts, type PlayedStep,
} from './momentFacts'
import { commentedGameText, type CommentOptions } from './recommentGame'
import { analyseGame } from './reviewEngine'
import { reviewEngine } from './reviewStore'

/**
 * AI commentary of the key moments of a game (S5). The engine finds the
 * moments (as in the template commentary); the model only words each one from
 * the facts of `momentFacts`: material, evaluations, engine lines, what the
 * game did next and the detected pattern. A failed or flagged answer leaves
 * the template remark of that moment.
 */

const PIECE_LETTERS: Record<string, string> = {
  en: 'K, Q, R, B, N (English SAN)',
  es: 'R (rey), D (dama), T (torre), A (alfil), C (caballo)',
  de: 'K (König), D (Dame), T (Turm), L (Läufer), S (Springer)',
  fr: 'R (roi), D (dame), T (tour), F (fou), C (cavalier)',
}

const LENGTH: Record<1 | 2 | 3, string> = {
  1: 'Write one short sentence.',
  2: 'Write at most two sentences: what the move does and why.',
  3: 'Write at most three sentences: what the move does, the plan or idea behind it and where the game goes (mate, material, attack).',
}

/** Longest comment accepted (characters). */
const MAX_COMMENT = 600

export const MOMENT_COMMENT_SYSTEM = [
  'You write one short remark about a key moment of a chess game, for a chess book.',
  'You are given the position, the move played, the engine evaluations and lines, what was actually played next with the material count, and the pattern detected (sacrifice, blunder, capture sequence, mating attack).',
  'Say what the move means: when a piece is sacrificed, say what it buys; when it is a blunder, say what it gives away; when material is won, how.',
  'Use only the facts given. Never invent moves, evaluations, material figures or variations that are not in the facts.',
  'Answer with JSON only, exactly {"comment": "<the remark>"}, and nothing else.',
].join('\n')

const SCHEMA = {
  type: 'object',
  properties: { comment: { type: 'string' } },
  required: ['comment'],
  additionalProperties: false,
}

const sideName = (c: 'white' | 'black') => (c === 'white' ? 'White' : 'Black')
const PIECE = { p: 'a pawn', n: 'a knight', b: 'a bishop', r: 'a rook', q: 'a queen' }

function stepText(step: PlayedStep): string {
  const taken = step.captured ? `takes ${PIECE[step.captured]}` : ''
  const promo = step.promotion ? `promotes to ${PIECE[step.promotion].slice(2)}` : ''
  const note = [taken, promo].filter(Boolean).join(', ')
  const lead = step.lead > 0 ? `+${step.lead}` : step.lead < 0 ? `−${-step.lead}` : '0'
  return `${step.label}${note ? ` (${note})` : ''} → lead ${lead}`
}

/** The facts of a moment as the text the model reads (English; the answer is in the chosen language). */
export function momentFactsText(f: MomentFacts): string {
  const who = sideName(f.color)
  const label = `${f.moveNumber}${f.color === 'white' ? '.' : '...'}${f.san}`
  const lines = [
    `Position before the move (FEN): ${f.fen}`,
    `Side to move: ${who}`,
    `Move played: ${label}`,
    `Engine evaluation for ${who} (the side that moved): before the move ${f.evalBeforeText}, after it ${f.evalAfterText}.`,
    `Material before the move: White ${f.materialBefore.white}, Black ${f.materialBefore.black} (${who} lead: ${f.leadBefore >= 0 ? '+' : '−'}${Math.abs(f.leadBefore)}); after it: White ${f.materialAfter.white}, Black ${f.materialAfter.black}.`,
  ]
  const played = f.san.replace(/[+#!?]+$/, '')
  if (f.best) {
    lines.push(f.best.san.replace(/[+#!?]+$/, '') === played
      ? `Engine's best line (the move played is the engine's choice): ${f.best.line.join(' ')}`
      : `Engine's best move was ${f.best.san}; its line: ${f.best.line.join(' ')}`)
  }
  if (f.second) lines.push(`Engine's second choice: ${f.second.line.join(' ')} (evaluation for White ${moverScoreText(f.second.score, 'white')}).`)
  const steps = f.played.map(stepText)
  lines.push(`Played in the game (material lead of ${who} after each ply): ${steps.join('; ')}.`)
  lines.push(`Outcome: ${describeEnding(f.ending)}.`)
  lines.push(f.patterns.length ? `Detected pattern: ${f.patterns.map(describePattern).join(' ')}` : 'Detected pattern: none (a key move of the game by evaluation).')
  return lines.join('\n')
}

export interface MomentPromptOptions {
  /** The language of the answer (es, en, de, fr). */
  lang: string
  level: 1 | 2 | 3
}

/** The request for the remark of one key moment. */
export function momentCommentPrompt(facts: MomentFacts, options: MomentPromptOptions): LlmRequest {
  const letters = PIECE_LETTERS[options.lang] ?? PIECE_LETTERS.en
  return {
    system: [
      MOMENT_COMMENT_SYSTEM,
      `Write the remark in ${langName(options.lang)}. ${LENGTH[options.level]}`,
      `Write every move you mention in the piece letters of ${langName(options.lang)}: ${letters}. Mention only moves listed in the facts.`,
    ].join('\n'),
    messages: [{ role: 'user', text: momentFactsText(facts) }],
    json: { schema: SCHEMA },
    maxTokens: 600,
  }
}

/** The remark of an {"comment": …} answer (a code fence around it is allowed). */
export function parseMomentComment(answer: string): string {
  const body = answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let value: unknown
  try { value = JSON.parse(body) } catch { throw new Error('The model did not answer with JSON.') }
  const comment = value && typeof value === 'object' ? (value as { comment?: unknown }).comment : undefined
  if (typeof comment !== 'string' || !comment.trim()) throw new Error('The model gave an empty comment.')
  return comment.trim()
}

const MOVE_PIECE = 'KQRBNSLTDACF♔♕♖♗♘♙♚♛♜♝♞♟'
const MOVE_TEXT = new RegExp(`(?<![\\p{L}\\d])(?:[O0]-[O0](?:-[O0])?|[${MOVE_PIECE}]?[a-h]?[1-8]?[x:×]?[a-h][1-8](?:=?[${MOVE_PIECE}])?)[+#]?(?![\\p{L}\\d])`, 'gu')
const NUMBER = /[+−-]?\d+[.,]\d+|[+−]\d+/g
const absNumber = (s: string) => Math.abs(parseFloat(s.replace('−', '-').replace(',', '.')))

/**
 * The problems of a remark; [] when it may be used: it is not empty or long,
 * mentions only moves of the facts (in any language's letters) and only
 * evaluations of the facts.
 */
export function validateMomentComment(facts: MomentFacts, comment: string): string[] {
  const text = comment.trim()
  if (!text) return ['the comment is empty']
  const problems: string[] = []
  if (text.length > MAX_COMMENT) problems.push(`the comment is too long (${text.length} characters)`)

  const factsText = momentFactsText(facts)
  const allowed = new Set(moveKeys(factsText))
  const squares = new Set([...allowed].map((k) => k.slice(-2)))
  for (const m of text.matchAll(MOVE_TEXT)) {
    const key = moveKeys(m[0])[0]
    if (!key || allowed.has(key)) continue
    // A bare square ("the f7 pawn") is fine when a move of the facts goes there.
    if (/^p[a-h][1-8]$/.test(key) && squares.has(key.slice(1))) continue
    problems.push(`move not in the facts: ${m[0]}`)
  }
  const known = new Set((factsText.match(NUMBER) ?? []).map(absNumber))
  for (const n of text.match(NUMBER) ?? []) {
    if (!known.has(absNumber(n))) problems.push(`evaluation not in the facts: ${n}`)
  }
  return problems
}

export interface CommentGameWithAiArgs {
  games: Parameters<typeof commentedGameText>[1]
  gameIndex: number
  text: string
  /** The model: the shared LLM client (injected in tests). */
  complete: (request: LlmRequest) => Promise<LlmResult>
  options: CommentOptions
  /** Steps done of in all: the positions analysed, then the key moments commented. */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

const aborted = () => new Error('aborted')

/**
 * The game commented again like `recommentGame` (engine analysis, key moments,
 * diagrams, layout), with the remark of each key moment written by the model
 * from the facts of the moment; where the model fails, the template remark.
 */
export async function commentGameWithAi(args: CommentGameWithAiArgs): Promise<string> {
  const { games, gameIndex, text, options, complete, onProgress, signal } = args
  const plies = await analyseGame(games[gameIndex].tree, reviewEngine(options.sfUrl), { depth: options.depth, onProgress, signal })
  const review = reviewGame(plies)
  const keyIds = new Set(review.keyMoments.map((k) => k.nodeId))
  const moments = plies.map((p, i) => ({ p, i })).filter(({ p }) => keyIds.has(p.nodeId) || p.san.includes('#'))
  const materials = materialByPly(plies)
  const positions = plies.length + 1
  const total = positions + moments.length
  const remarks: Record<number, string> = {}
  let done = 0
  for (const { i } of moments) {
    if (signal?.aborted) throw aborted()
    const facts = momentFacts(plies, i, { materials })
    try {
      const answer = await complete(momentCommentPrompt(facts, { lang: options.lang, level: options.level }))
      const comment = parseMomentComment(answer.text)
      if (validateMomentComment(facts, comment).length === 0) remarks[i + 1] = comment
    } catch {
      // The template remark stays; only a stop ends the run.
      if (signal?.aborted) throw aborted()
    }
    onProgress?.(positions + ++done, total)
  }
  if (signal?.aborted) throw aborted()
  return commentedGameText({ plies, review }, games, gameIndex, text, options, remarks)
}

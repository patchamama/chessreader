import { narrationWords, parseActions, positionFacts, serializeActions, validateActions } from '@chess-ebook/chess-shared'
import type { PositionFacts } from '@chess-ebook/chess-shared'
import type { LlmRequest, LlmResult } from '../../../shared/llm'
import { setCommentActions } from '../../comments/commentsApi'

/**
 * The AI step that writes the narration actions of a comment (studies-epub-pgn-narration S6):
 * it is told the comment (words numbered), the position, what each piece can reach and,
 * when there are, the engine's evaluations; it answers {"actions": "0Diagonal:c8-h3, 13Arrow:f7-f5"}.
 * The answer is then checked against the position and what does not fit is discarded.
 */

export type Complete = (request: LlmRequest) => Promise<LlmResult>

export interface ActionsInput {
  text: string
  fen: string
  /** Stockfish lines or evaluations, as text (optional). */
  evals?: string[]
  /** The moves of the game around the comment (text, e.g. "11.Nf3 Nc6 12.Bb5"). */
  context?: { previous?: string; next?: string }
}

const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as const

/** The position as plain facts: who moves, and for every piece the squares it can go to and the lines it sees. */
export function factsText(facts: PositionFacts): string {
  const lines = [`${facts.turn === 'w' ? 'White' : 'Black'} to move.`]
  for (const p of facts.pieces) {
    const color = p.color === 'w' ? 'white' : 'black'
    const rays = p.rays.map((r) => `${r.kind} ${r.from}-${r.to}`)
    lines.push(`${NAMES[p.piece]} ${p.square} (${color}): ${p.moves.length ? p.moves.join(', ') : 'no moves'}${rays.length ? `; sees: ${rays.join(', ')}` : ''}`)
  }
  return lines.join('\n')
}

const SYSTEM = [
  'You prepare the board animation that goes with a chess comment while it is read aloud.',
  'Write a short list of actions. Each is "<word index><Action>[:args]", the word index counting the words of the comment from 0 (the numbered list below).',
  'Actions: Square:e4  Squares:e4|e5  Arrow:f7-f5  Diagonal:c8-h3  Line:a1-a8 (a rank or a file)  Piece:c8 (highlight the piece on c8)  Clear (wipe what was shown).',
  'Example: "0Diagonal:c8-h3, 13Arrow:f7-f5" lights the diagonal c8-h3 when the comment starts and draws the arrow f7-f5 when the word 13 is read.',
  'Show only what the comment says: the squares, pieces, diagonals, files and moves it names or clearly means, at the word where it says them.',
  'Squares and moves must exist in THIS position: an Arrow starts on a piece that can really go there; use the lists of what each piece can reach.',
  'A bare square in the comment is a move of the side to move unless the comment names the other side.',
  'Use at most 8 actions. Answer with JSON only, exactly {"actions": "<the list, separated by commas>"}, and nothing else.',
].join('\n')

export function actionsPrompt(input: ActionsInput): LlmRequest {
  const words = narrationWords(input.text).map((w, i) => `${i}:${w}`).join(' ')
  const parts = [
    `Position (FEN): ${input.fen}`,
    `Comment, numbered words:\n${words}`,
    `What each piece can reach (legal moves; the other side as if it were to move):\n${factsText(positionFacts(input.fen))}`,
  ]
  if (input.context?.previous) parts.push(`Moves played just before the comment: ${input.context.previous}`)
  if (input.context?.next) parts.push(`Moves played just after the comment: ${input.context.next}`)
  if (input.evals?.length) parts.push(`Stockfish evaluations:\n${input.evals.join('\n')}`)
  return { system: SYSTEM, messages: [{ role: 'user', text: parts.join('\n\n') }], json: true }
}

/** The action list of a {"actions": "…"} (or {"actions": ["…", …]}) answer. */
export function parseActionsAnswer(answer: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(answer)
  const raw = (fenced ? fenced[1] : answer).trim()
  const start = raw.indexOf('{')
  let value: unknown
  try { value = JSON.parse(start >= 0 ? raw.slice(start, raw.lastIndexOf('}') + 1) : raw) } catch { throw new Error('The model did not answer with JSON.') }
  const actions = (value as { actions?: unknown } | null)?.actions
  if (Array.isArray(actions) && actions.every((a) => typeof a === 'string')) return actions.join(', ')
  if (typeof actions !== 'string') throw new Error('The model did not give an actions list.')
  return actions
}

export interface ActionsProposal {
  /** The valid actions, serialised: what is stored with the comment ("" when none is valid). */
  actions: string
  model: string
  /** What the model wrote that does not fit the comment or the position (text as written, reason). */
  rejected: { action: string; reason: string }[]
}

/** Ask the model for the actions of a comment and keep those that are valid on the position. */
export async function proposeActions(complete: Complete, input: ActionsInput): Promise<ActionsProposal> {
  const result = await complete(actionsPrompt(input))
  const { actions, errors } = parseActions(parseActionsAnswer(result.text))
  const { valid, rejected } = validateActions(actions, input.fen, { words: narrationWords(input.text).length })
  return {
    actions: serializeActions(valid),
    model: result.model,
    rejected: [
      ...rejected.map((r) => ({ action: serializeActions([r.action]), reason: r.reason })),
      ...errors.map((e) => ({ action: e, reason: 'unreadable' })),
    ],
  }
}

/** Ask for the actions of a comment of the database and store the valid ones with it (admin); nothing is saved when none is valid. */
export async function generateCommentActions(complete: Complete, comment: { id: number; text: string; fen: string }, evals?: string[]): Promise<ActionsProposal & { saved: boolean }> {
  const proposal = await proposeActions(complete, { text: comment.text, fen: comment.fen, ...(evals ? { evals } : {}) })
  if (!proposal.actions) return { ...proposal, saved: false }
  await setCommentActions(comment.id, proposal.actions)
  return { ...proposal, saved: true }
}

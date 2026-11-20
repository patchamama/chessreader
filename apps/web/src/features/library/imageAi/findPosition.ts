import { solveDiagram, type DiagramSolution, type SquareReading } from '@chess-ebook/chess-shared'
import type { LlmRequest, LlmResult } from '../../../shared/llm'
import { fenPrompt, parseVisionBoard } from './prompts'

/**
 * "Find the position" of a diagram (S7, S9): the readings of any reader
 * (per-book templates, a vision model, or none) plus the moves printed after
 * the diagram, through the chess-shared solver.
 */
export interface FindPositionInput {
  followingText: string
  /** Readings of each reader; all go into the solver together. */
  readings?: SquareReading[][]
}

export function findPosition({ followingText, readings = [] }: FindPositionInput): DiagramSolution[] {
  return solveDiagram(readings.flat(), followingText, { topN: 3 })
}

export interface VisionReading {
  readings: SquareReading[]
  sideToMove: 'w' | 'b' | null
  model: string
}

/** The vision model's reading of a diagram image (a data URL), strictly checked; throws with the reason otherwise. */
export async function visionReading(complete: (r: LlmRequest) => Promise<LlmResult>, image: string): Promise<VisionReading> {
  const request = fenPrompt(image)
  let result: LlmResult
  try {
    result = await complete(request)
  } catch (e) {
    // Some servers (Ollama with MLX models) have no structured output: ask for plain text, the JSON is read out of it.
    if (!/structured|json|response_format|format/i.test((e as Error).message)) throw e
    const plain: LlmRequest = { ...request }
    delete plain.json
    result = await complete(plain)
  }
  const board = parseVisionBoard(result.text)
  if (!board.ok) throw new Error(`The model's board could not be used: ${board.error}`)
  return { readings: board.readings, sideToMove: board.sideToMove, model: result.model }
}

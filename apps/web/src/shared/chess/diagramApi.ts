import { httpClient } from '../api/httpClient'
import type { DiagramEval } from './diagramEvalFooter'

export interface RegenerateDiagramRequest {
  fen: string
  lightColor?: string
  darkColor?: string
  pieceSet?: string
  coordinates?: boolean
  /** Request a rasterized PNG in addition to the SVG. */
  exportPng?: boolean
  depth?: number
}

export interface RegenerateDiagramResponse {
  svg: string
  footer: string
  eval: DiagramEval
  /** base64-encoded PNG, present only when exportPng was requested. */
  png?: string
}

/**
 * Regenerate a board diagram on the backend for a given FEN, returning the SVG,
 * a short footer, and the structured Stockfish evaluation.
 */
export async function regenerateDiagram(
  req: RegenerateDiagramRequest,
): Promise<RegenerateDiagramResponse> {
  return httpClient<RegenerateDiagramResponse>('/api/diagrams/regenerate', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

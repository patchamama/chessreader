import { httpClient } from '../../shared/api/httpClient'
import { isDemoHost } from '../../shared/env/devMode'
import { useAuthStore } from '../auth/store/authStore'
import { uciLineToSan } from '../library/review/reviewEngine'

export interface HumanMoves { rating: number; moves: { san: string; probability: number }[] }

/**
 * What a player of `rating` would most likely play in a position, from Maia on
 * the server (nets trained on human games). Null without a server or Maia.
 */
export async function humanMoves(fen: string, rating: number): Promise<HumanMoves | null> {
  if (isDemoHost() || !useAuthStore.getState().token) return null
  try {
    const r = await httpClient<{ rating: number; moves: { uci: string; probability: number }[] }>(
      `/api/engine/human?fen=${encodeURIComponent(fen)}&rating=${rating}&limit=3`, { method: 'GET' })
    return {
      rating: r.rating,
      moves: r.moves.map((m) => ({ san: uciLineToSan(fen, [m.uci])[0], probability: m.probability })).filter((m) => m.san),
    }
  } catch {
    return null
  }
}

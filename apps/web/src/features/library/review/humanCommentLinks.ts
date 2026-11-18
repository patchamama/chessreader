import type { Lang } from '@chess-ebook/chess-shared'
import { humanCommentsForGame, lookupPositionComments } from '../commentdb/commentLookup'

/** A book remark for annotateGame's `human` option, with the commentary database game and ply it comes from. */
export interface LinkedHumanComment { text: string; source: string; gameId?: string; ply?: number }

/**
 * The remarks humanCommentsForGame picks for a game, each with the commentary
 * database game and ply it was found in (S5), so the commented game can link
 * back to it. A remark whose origin cannot be found again keeps no link.
 */
export async function humanCommentsWithLinks(plies: Array<{ fenAfter: string }>, lang: Lang): Promise<Record<number, LinkedHumanComment>> {
  const found = await humanCommentsForGame(plies, lang)
  const out: Record<number, LinkedHumanComment> = {}
  for (const [key, comment] of Object.entries(found)) {
    const ply = Number(key)
    const origin = await lookupPositionComments(plies[ply - 1].fenAfter)
      .then((all) => all.find((c) => c.text === comment.text))
      .catch(() => undefined)
    out[ply] = origin ? { ...comment, gameId: origin.gameId, ply: origin.ply } : comment
  }
  return out
}

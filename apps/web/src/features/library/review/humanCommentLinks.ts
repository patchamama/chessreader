import type { Lang } from '@chess-ebook/chess-shared'
import { commentSource, humanCommentsForGame, lookupPositionComments, type HumanComment } from '../commentdb/commentLookup'
import { isLocalLlm } from '../../../shared/llm/isLocalLlm'
import { normalizeBorrowedComment, translateBorrowedComment } from '../../comments/commentAi'
import { configuredLlm } from '../../../shared/llm'
import { complete } from '../../../shared/llm/llmClient'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { commentAlternativesAttr, type CommentAlternative } from '../utils/diagramMark'

/** A book remark for annotateGame's `human` option, with the commentary database game and ply it comes from. */
export interface LinkedHumanComment {
  text: string
  source: string
  gameId?: string
  ply?: number
  /** Every remark the database holds on the same position (this one included), when there are several (S4). */
  alternatives?: CommentAlternative[]
}

/** The remarks of a position the reader may be shown: in the reader's language when there are any, one per text. */
function alternativesOf(all: HumanComment[], lang: Lang): CommentAlternative[] {
  const own = all.filter((c) => c.lang === lang)
  const seen = new Set<string>()
  return (own.length ? own : all)
    .filter((c) => !seen.has(c.text) && !!seen.add(c.text))
    .map((c) => ({ text: c.text, source: commentSource(c), ...(c.gameId ? { gameId: c.gameId } : {}), ...(c.ply > 0 ? { ply: c.ply } : {}) }))
}

/**
 * The remarks humanCommentsForGame picks for a game, each with the commentary
 * database game and ply it was found in (S5), so the commented game can link
 * back to it, and the other remarks of the same position (S4). A remark whose
 * origin cannot be found again keeps no link.
 */
export async function humanCommentsWithLinks(plies: Array<{ fenAfter: string }>, lang: Lang): Promise<Record<number, LinkedHumanComment>> {
  const { commentSourcePriority, translateMissingComments, normalizeWhileCommenting } = useSettingsStore.getState()
  const llm = configuredLlm()
  const config = translateMissingComments ? llm : null
  const normalizer = normalizeWhileCommenting && llm && !isLocalLlm(llm) ? llm : null
  const normalize = normalizer ? (c: HumanComment & { fen: string }) => normalizeBorrowedComment((request) => complete(normalizer, request), c) : undefined
  const translate = config ? (c: HumanComment & { fen: string }, to: string) => translateBorrowedComment((request) => complete(config, request), c, to) : undefined
  const found = await humanCommentsForGame(plies, lang, undefined, { priority: commentSourcePriority, translate, normalize })
  const out: Record<number, LinkedHumanComment> = {}
  for (const [key, comment] of Object.entries(found)) {
    const ply = Number(key)
    const all = await lookupPositionComments(plies[ply - 1].fenAfter).catch(() => [] as HumanComment[])
    const origin = all.find((c) => c.text === comment.text)
    const alternatives = alternativesOf(all, lang)
    out[ply] = {
      ...comment,
      ...(origin ? { gameId: origin.gameId, ply: origin.ply } : {}),
      ...(alternatives.length > 1 ? { alternatives } : {}),
    }
  }
  return out
}

/**
 * Write the other remarks of each commented position onto its comment mark
 * (`[Comment … fen="…"]` → `[Comment … fen="…" alts="…"]`), so the reader can
 * pick one of them when the book comments are shown again (S4).
 */
export function withCommentAlternatives(
  text: string,
  human: Record<number, LinkedHumanComment>,
  plies: Array<{ fenAfter: string }>,
): string {
  const byFen = new Map<string, CommentAlternative[]>()
  for (const [key, comment] of Object.entries(human)) {
    const fen = plies[Number(key) - 1]?.fenAfter
    if (fen && comment.alternatives && comment.alternatives.length > 1) byFen.set(fen, comment.alternatives)
  }
  if (byFen.size === 0) return text
  return text.split('\n').map((line) => {
    if (!line.trimStart().startsWith('[Comment') || / alts="/.test(line)) return line
    const fen = /\sfen="([^"]*)"/.exec(line)?.[1]
    const alternatives = fen ? byFen.get(fen) : undefined
    return alternatives ? line.replace(/\]\s*$/, `${commentAlternativesAttr(alternatives)}]`) : line
  }).join('\n')
}

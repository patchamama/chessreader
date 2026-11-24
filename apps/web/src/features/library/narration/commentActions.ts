import { localActionsFor } from './guideStore'
import { hasCommentSource, lookupPositionComments, type HumanComment } from '../commentdb/commentLookup'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** The actions of the comment (among those of a position) whose text is the one being narrated. */
export function actionsOfMatching(comments: Pick<HumanComment, 'text' | 'actions'>[], narrated: string): string | undefined {
  const text = norm(narrated)
  const hit = comments.find((c) => {
    if (!c.actions) return false
    const own = norm(c.text)
    return own === text || (own.length >= 20 && (text.includes(own) || own.includes(text)))
  })
  return hit?.actions
}

/** Where the narrator gets the actions of a comment: the comments database, by the position the comment talks about. */
export async function databaseActionsFor(commentText: string, fen: string): Promise<string | undefined> {
  if (!hasCommentSource()) return undefined
  try {
    return actionsOfMatching(await lookupPositionComments(fen), commentText)
  } catch {
    return undefined
  }
}

/** The narrator's source: the comments database first, then the guides kept in this browser (ai-narration-guides S2). */
export async function narratorActionsFor(commentText: string, fen: string): Promise<string | undefined> {
  return (await databaseActionsFor(commentText, fen)) ?? localActionsFor(commentText, fen)
}

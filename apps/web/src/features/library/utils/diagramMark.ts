/** A diagram mark of a commented game: `[Diagram fen="…" eval="…" line="…" alt="…"]`. */
export interface DiagramMark {
  fen: string
  /** The evaluation in words, with the engine and depth. */
  eval?: string
  /** The engine's next moves from the diagram. */
  line?: string
  /** An alternative line with its score. */
  alt?: string
}

/** Read a diagram mark line (attributes in any order), or null for any other line. */
export function parseDiagramMark(line: string): DiagramMark | null {
  const m = /^\[Diagram((?:\s+\w+="[^"]*")+)\s*\]$/.exec(line.trim())
  if (!m) return null
  const attrs: Record<string, string> = {}
  for (const [, k, v] of m[1].matchAll(/(\w+)="([^"]*)"/g)) attrs[k] = v
  if (!attrs.fen) return null
  return {
    fen: attrs.fen,
    ...(attrs.eval ? { eval: attrs.eval } : {}),
    ...(attrs.line ? { line: attrs.line } : {}),
    ...(attrs.alt ? { alt: attrs.alt } : {}),
  }
}

/**
 * A remark borrowed from a book: `[Comment source="…" text="…" fen="…" game="…" ply="…"]`
 * (`fen`: the position it speaks of; `game`/`ply`: where it is in the commentary database).
 */
export interface CommentMark {
  text: string; source: string; fen?: string; gameId?: string; ply?: number
  /** Every remark the database holds on the same position (this one included), for the reader to pick another one (S4). */
  alternatives?: CommentAlternative[]
}

/** One remark of a position, as kept in a comment mark's `alts` attribute. */
export interface CommentAlternative { text: string; source: string; gameId?: string; ply?: number }

/** The ` alts="…"` attribute of a comment mark (URI-encoded JSON); empty for fewer than two remarks. */
export function commentAlternativesAttr(alternatives: CommentAlternative[]): string {
  return alternatives.length > 1 ? ` alts="${encodeURIComponent(JSON.stringify(alternatives))}"` : ''
}

function readAlternatives(raw: string | undefined): CommentAlternative[] | undefined {
  if (!raw) return undefined
  try {
    const list = JSON.parse(decodeURIComponent(raw)) as unknown
    if (!Array.isArray(list)) return undefined
    const alts = list.filter((a): a is CommentAlternative => !!a && typeof a.text === 'string' && typeof a.source === 'string')
    return alts.length > 1 ? alts : undefined
  } catch {
    return undefined
  }
}

export function parseCommentMark(line: string): CommentMark | null {
  const m = /^\[Comment((?:\s+\w+="[^"]*")+)\s*\]$/.exec(line.trim())
  if (!m) return null
  const attrs: Record<string, string> = {}
  for (const [, k, v] of m[1].matchAll(/(\w+)="([^"]*)"/g)) attrs[k] = v
  if (!attrs.text) return null
  return {
    text: attrs.text, source: attrs.source ?? '',
    ...(attrs.fen ? { fen: attrs.fen } : {}),
    ...(attrs.game ? { gameId: attrs.game } : {}),
    ...(attrs.ply && Number(attrs.ply) > 0 ? { ply: Number(attrs.ply) } : {}),
    ...(readAlternatives(attrs.alts) ? { alternatives: readAlternatives(attrs.alts) } : {}),
  }
}

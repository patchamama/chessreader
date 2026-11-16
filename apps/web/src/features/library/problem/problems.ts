import { qualityFromAnnotation } from '@chess-ebook/chess-shared'
import type { GameNode, GameTree, Lang, MoveQuality, RecognizedGame } from '@chess-ebook/chess-shared'

export type ProblemReason = 'marked' | 'commented' | 'variations' | 'engine'

export interface Problem {
  /** The move to find (a move of the main line). */
  nodeId: string
  reason: ProblemReason
}

const MIN_PLY = 6 // not in the first three moves
const LONG_COMMENT = 160

/**
 * The positions of a game worth stopping at: before a move the text marks as
 * strong ("!", "!!"), a move followed by a long remark or by variations, or a
 * strong move an engine review found.
 */
export function findProblems(
  text: string,
  game: RecognizedGame,
  reviewed: Array<{ nodeId: string; quality?: MoveQuality }> = [],
): Problem[] {
  const tree = game.tree
  const main = tree.mainline.map((id) => tree.nodes.get(id)!)
  const engine = new Map(reviewed.map((m) => [m.nodeId, m.quality]))
  const children = new Map<string | null, number>()
  for (const n of tree.nodes.values()) children.set(n.parentId, (children.get(n.parentId) ?? 0) + 1)
  const out: Problem[] = []
  main.forEach((node, i) => {
    if (i < MIN_PLY || node.invalid) return
    const mark = /(\?\?|!!|\?!|!\?|\?|!)\s*$/.exec(node.rawSan ?? '')?.[1]
    const written = mark ? qualityFromAnnotation(mark) : undefined
    const next = main[i + 1]
    const remark = node.charEnd !== undefined
      ? text.slice(node.charEnd, next?.charStart ?? Math.min(text.length, node.charEnd + 400)).replace(/\([^)]*\)/g, '').trim()
      : ''
    const q = engine.get(node.id)
    let reason: ProblemReason | null = null
    if (written === 'good' || written === 'brilliant') reason = 'marked'
    else if (q === 'good' || q === 'brilliant') reason = 'engine'
    else if (written === undefined && (children.get(node.parentId) ?? 0) >= 3) reason = 'variations'
    else if (written === undefined && remark.length >= LONG_COMMENT) reason = 'commented'
    if (reason) out.push({ nodeId: node.id, reason })
  })
  return out
}

const PIECE: Record<Lang, Record<string, [string, string]>> = {
  // [indefinite, definite]
  es: { P: ['un peón', 'el peón'], N: ['un caballo', 'el caballo'], B: ['un alfil', 'el alfil'], R: ['una torre', 'la torre'], Q: ['la dama', 'la dama'], K: ['el rey', 'el rey'] },
  en: { P: ['a pawn', 'the pawn'], N: ['a knight', 'the knight'], B: ['a bishop', 'the bishop'], R: ['a rook', 'the rook'], Q: ['the queen', 'the queen'], K: ['the king', 'the king'] },
  de: { P: ['einen Bauern', 'den Bauern'], N: ['einen Springer', 'den Springer'], B: ['einen Läufer', 'den Läufer'], R: ['einen Turm', 'den Turm'], Q: ['die Dame', 'die Dame'], K: ['den König', 'den König'] },
}

/** A hint for the move: level 1 names the kind of piece, level 2 the piece itself. */
export function hintFor(_tree: GameTree, node: GameNode, level: 1 | 2, lang: Lang): string {
  const letter = node.san.startsWith('O-O') ? 'K' : /^[KQRBN]/.exec(node.san)?.[0] ?? 'P'
  const [a, the] = PIECE[lang][letter]
  if (level === 1) return lang === 'es' ? `Mueve ${a}.` : lang === 'en' ? `Move ${a}.` : `Ziehe ${a}.`
  return lang === 'es' ? `Mueve ${the} de ${node.from}.` : lang === 'en' ? `Move ${the} on ${node.from}.` : `Ziehe ${the} auf ${node.from}.`
}

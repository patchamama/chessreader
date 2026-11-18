import { Chess } from 'chess.js'
import { figurineToAscii, sanSimilarity, spanishToEnglish, tokenize } from '@chess-ebook/chess-shared'
import type { RecognizedGame } from '@chess-ebook/chess-shared'
import type { ErrataSource } from '../errata/errataFormat'

/**
 * Correction workbench: the moves of a game as an editable list. When the
 * reader cannot repair a game by itself (a doubtful repair, a move the OCR
 * dropped), the user changes, inserts or removes moves here, checks the result
 * up to any point, and exports it to fix the original text.
 */
export interface EditableMove {
  id: string
  /** The move in English SAN (what is checked and exported). */
  san: string
  /** Where the move is written in the source, and how. Absent for an inserted move. */
  source?: { charStart: number; charEnd: number; written: string }
  /** Set when the reader replaced the written move by a repair, with the move it proposes. */
  repaired?: boolean
  suggestion?: string
  /** Where a changed move comes from (an errata entry records it): typed, the reader's/legal-move proposal, or an online game. */
  origin?: ErrataSource
  /** The online game (or note) the change comes from. */
  evidence?: string
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const core = (san: string) => san.replace(/[!?]+$/g, '')

/**
 * Every move of the game as it is WRITTEN at top level: the moves the reader
 * took as the main line (a move it repaired keeps what is written, with the
 * repair as a suggestion), then whatever follows where recognition stopped.
 */
export function initialMoves(text: string, game: RecognizedGame): EditableMove[] {
  const tree = game.tree
  const byStart = new Map<number, { id: string; san: string; repaired: boolean }>()
  let lastMainEnd = game.charStart
  for (const id of tree.mainline) {
    const n = tree.nodes.get(id)!
    if (n.charStart === undefined || n.charEnd === undefined) continue
    byStart.set(n.charStart, { id: n.id, san: core(n.san), repaired: !!n.correctedFrom })
    lastMainEnd = Math.max(lastMainEnd, n.charEnd)
  }
  const out: EditableMove[] = []
  const base = game.charStart
  let depth = 0
  let seq = 0
  for (const t of tokenize(spanishToEnglish(figurineToAscii(text.slice(base, game.charEnd))))) {
    if (t.type === 'variation-open') depth++
    else if (t.type === 'variation-close') depth = Math.max(0, depth - 1)
    if (t.type !== 'move' || !t.san) continue
    const charStart = base + t.charStart
    const charEnd = base + t.charEnd
    const node = byStart.get(charStart)
    const source = { charStart, charEnd, written: text.slice(charStart, charEnd) }
    if (node) {
      out.push({ id: node.id, san: core(t.san), source, ...(node.repaired ? { repaired: true, suggestion: node.san } : {}) })
    } else if (depth === 0 && !t.isolated && charStart >= lastMainEnd) {
      out.push({ id: `tail-${seq++}`, san: core(t.san), source })
    }
  }
  return out
}

/** A move typed by hand, as English SAN (Spanish letters, figurines, 0-0). */
export function normaliseSan(input: string): string {
  const s = figurineToAscii(input.trim()).replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O')
  // A leading Spanish piece letter. "R" is left alone: it is a rook in English.
  return s.replace(/^[CADT](?=[a-h1-8x])/, (c) => ({ C: 'N', A: 'B', D: 'Q', T: 'R' } as Record<string, string>)[c])
}

export interface CheckResult {
  /** How many moves from the start are legal. */
  legal: number
  /** Position after each legal move (fens[0] = start). */
  fens: string[]
  error?: { index: number; san: string; candidates: string[] }
}

/** Replays the list; stops at the first move that is not legal (or at `upTo` moves). */
export function checkMoves(sans: string[], options: { upTo?: number; startFen?: string } = {}): CheckResult {
  const chess = new Chess(options.startFen ?? START)
  const fens = [chess.fen()]
  const limit = Math.min(sans.length, options.upTo ?? sans.length)
  for (let i = 0; i < limit; i++) {
    const san = normaliseSan(core(sans[i]))
    try {
      chess.move(san)
    } catch {
      const candidates = chess.moves()
        .map((m) => ({ m, score: sanSimilarity(san, m) }))
        .filter((c) => c.score >= 3)
        .sort((a, b) => b.score - a.score || a.m.localeCompare(b.m))
        .map((c) => c.m)
      return { legal: i, fens, error: { index: i, san: sans[i], candidates: candidates.slice(0, 6) } }
    }
    fens.push(chess.fen())
  }
  return { legal: limit, fens }
}

/** The moves as a PGN game. */
export function exportPgn(sans: string[], players: { white?: string | null; black?: string | null } = {}): string {
  const tags = [
    players.white ? `[White "${players.white}"]` : '',
    players.black ? `[Black "${players.black}"]` : '',
    '[Result "*"]',
  ].filter(Boolean)
  const body = sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${normaliseSan(core(san))}` : normaliseSan(core(san)))).join(' ')
  return `${tags.join('\n')}\n\n${body} *\n`
}

export interface Correction {
  kind: 'replaced' | 'inserted' | 'deleted'
  /** Ply (1-based) in the ORIGINAL list for replaced/deleted, in the edited list for inserted. */
  ply: number
  written?: string
  corrected?: string
  /** Where to make the change in the source text. */
  charStart?: number
  charEnd?: number
}

/** What was changed against the source, in text order. */
export function correctionList(_text: string, original: EditableMove[], edited: EditableMove[]): Correction[] {
  const out: Array<Correction & { at: number }> = []
  const kept = new Map(edited.map((m, i) => [m.id, { m, i }]))
  original.forEach((o, i) => {
    const e = kept.get(o.id)
    const src = o.source
    if (!e) out.push({ kind: 'deleted', ply: i + 1, written: src?.written, charStart: src?.charStart, charEnd: src?.charEnd, at: src?.charStart ?? 0 })
    else if (normaliseSan(core(e.m.san)) !== o.san) {
      out.push({ kind: 'replaced', ply: i + 1, written: src?.written, corrected: e.m.san, charStart: src?.charStart, charEnd: src?.charEnd, at: src?.charStart ?? 0 })
    }
  })
  const originalIds = new Set(original.map((m) => m.id))
  edited.forEach((m, i) => {
    if (originalIds.has(m.id)) return
    // An inserted move goes right after the previous move that has a place in the text.
    let anchor: EditableMove | undefined
    for (let j = i - 1; j >= 0 && !anchor; j--) if (edited[j].source) anchor = edited[j]
    const at = anchor?.source?.charEnd ?? original[0]?.source?.charStart ?? 0
    out.push({ kind: 'inserted', ply: i + 1, corrected: m.san, charStart: at, charEnd: at, at: at + 0.5 })
  })
  return out.sort((a, b) => a.at - b.at).map((c) => {
    const copy: Correction & { at?: number } = { ...c }
    delete copy.at
    return copy
  })
}

/** The source text with the corrections applied (changes made from the end backwards). */
export function applyToText(text: string, original: EditableMove[], edited: EditableMove[]): string {
  let out = text
  for (const c of correctionList(text, original, edited).reverse()) {
    if (c.charStart === undefined || c.charEnd === undefined) continue
    const replacement = c.kind === 'deleted' ? '' : c.kind === 'inserted' ? ` ${c.corrected}` : c.corrected ?? ''
    out = out.slice(0, c.charStart) + replacement + out.slice(c.charEnd)
  }
  return out
}

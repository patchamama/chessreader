import { Chess } from 'chess.js'
import { createGameTree, figurineToAscii, recognizeGames, spanishToEnglish, tokenize, treeToPgn, type GameNode, type GameTree } from '@chess-ebook/chess-shared'
import type { AnalysisBoardInput } from './analysisBoards'
import { START_FEN, boardLine } from './analysisLine'

/** The game an analysis board holds: a position and the moves (UCI) played from it. */
export interface AnalysisLine {
  startFen: string
  moves: string[]
}

const FEN_RE = /^\s*\[?\s*(?:FEN\s+")?([pnbrqkPNBRQK1-8]+(?:\/[pnbrqkPNBRQK1-8]+){7}\s+[wb]\s+(?:-|[KQkq]{1,4})\s+(?:-|[a-h][36])(?:\s+\d+\s+\d+)?)"?\s*\]?\s*$/

/** A legal position, with its two counters when the text leaves them out. */
function fullFen(fen: string): string | null {
  const full = fen.trim().split(/\s+/).length >= 6 ? fen.trim() : `${fen.trim()} 0 1`
  try { new Chess(full); return full } catch { return null }
}

/** SAN moves played from a position, as UCI (stops at the first move that is not legal). */
function toUci(startFen: string, sans: string[]): string[] {
  const chess = new Chess(startFen)
  const out: string[] = []
  for (const san of sans) {
    try {
      const m = chess.move(san.replace(/[!?]+$/, ''))
      out.push(`${m.from}${m.to}${m.promotion ?? ''}`)
    } catch { break }
  }
  return out
}

/** The main-line moves of a fragment (a book's moves after its diagram): no variations, no comments. */
function movesAfterFen(startFen: string, text: string): string[] {
  const read = (normalised: string) => {
    let depth = 0
    const out: string[] = []
    for (const t of tokenize(normalised)) {
      if (t.type === 'variation-open') depth++
      else if (t.type === 'variation-close') depth = Math.max(0, depth - 1)
      else if (t.type === 'move' && t.san && depth === 0) out.push(t.san)
    }
    return toUci(startFen, out)
  }
  // English letters ("Re8": rook) or Spanish ones ("Re8": king): the reading that plays more moves.
  const plain = figurineToAscii(text.replace(/\{[^}]*\}/g, ' '))
  const english = read(plain)
  const spanish = read(spanishToEnglish(plain))
  return spanish.length > english.length ? spanish : english
}

/**
 * The game of a text typed or pasted on the analysis board: a PGN or a book's
 * text (Spanish letters, figurines…), its main line. A FEN on a line of its own
 * (or a `[FEN "…"]` tag) sets the position the game starts from, as books do.
 * Null when the text has neither moves nor a position.
 */
export function gameFromText(text: string): AnalysisLine | null {
  let fen: string | null = null
  let rest = text
  const lines = text.split('\n')
  const at = lines.findIndex((l) => FEN_RE.test(l) && !!fullFen(FEN_RE.exec(l)![1]))
  if (at >= 0) {
    fen = fullFen(FEN_RE.exec(lines[at])![1])
    rest = lines.slice(at + 1).join('\n')
  }
  const startFen = fen ?? START_FEN
  if (fen) {
    // A book's fragment after its diagram: the reader's recognizer first (it tells
    // the game's moves from those quoted in its comments), else the moves as they come.
    const own = recognizeGames(`${fen}\n${rest.replace(/\[[^\]]*\]/g, ' ')}`)[0]
    const sans = own && fullFen(own.tree.startFen) === startFen ? own.tree.mainline.map((id) => own.tree.nodes.get(id)?.san ?? '') : []
    const read = toUci(startFen, sans)
    return { startFen, moves: read.length > 0 ? read : movesAfterFen(startFen, rest.replace(/\[[^\]]*\]/g, ' ')) }
  }
  const game = recognizeGames(rest.replace(/\[[^\]]*\]/g, ' '))[0]
  if (!game) {
    // Too short for the reader's recognizer ("1. e4"): the moves as they come.
    const moves = movesAfterFen(startFen, rest.replace(/\[[^\]]*\]/g, ' '))
    return moves.length > 0 ? { startFen, moves } : null
  }
  const sans = game.tree.mainline.map((id) => game.tree.nodes.get(id)?.san ?? '')
  const moves = toUci(startFen, sans)
  if (moves.length === 0 && !fen) {
    // A game that sets up its own position (a FEN the recognizer read).
    const own = fullFen(game.tree.startFen)
    if (own && own !== START_FEN) return { startFen: own, moves: toUci(own, sans) }
    return null
  }
  return { startFen, moves }
}

/** The line of a board opened from a book (a line of moves or a game's PGN). */
export function lineOfBoard(board: AnalysisBoardInput): AnalysisLine {
  const { startFen, moves } = boardLine(board)
  return { startFen, moves: toUci(startFen, moves) }
}

/**
 * A move played on the board after the first `ply` moves of the line: the line
 * goes on with it (the moves that followed are dropped, unless it is the line's
 * own next move). Null when the move is not legal there.
 */
export function lineAfterMove(line: AnalysisLine, ply: number, from: string, to: string): AnalysisLine | null {
  const chess = new Chess(line.startFen)
  for (const uci of line.moves.slice(0, ply)) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
  let m
  try { m = chess.move({ from, to, promotion: 'q' }) } catch { return null }
  const uci = `${m.from}${m.to}${m.promotion ?? ''}`
  if (line.moves[ply] === uci) return line
  return { startFen: line.startFen, moves: [...line.moves.slice(0, ply), uci] }
}

/** The line as a game tree (the move lists, thumbnails and engine review read trees). */
export function lineTree(line: AnalysisLine): GameTree {
  const tree = createGameTree(line.startFen)
  const chess = new Chess(line.startFen)
  let parentId: string | null = null
  line.moves.forEach((uci, i) => {
    const moveNumber = chess.moveNumber()
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
    const id = `a${i + 1}`
    const node: GameNode = {
      id, san: m.san, fen: chess.fen(), from: m.from, to: m.to,
      moveNumber, color: m.color === 'w' ? 'white' : 'black', parentId,
    }
    tree.nodes.set(id, node)
    tree.mainline.push(id)
    parentId = id
  })
  return tree
}

/** The line as a PGN file (with its position when it does not start from the initial one). */
export function lineToPgn(line: AnalysisLine, tags: Record<string, string> = {}): string {
  const all = { Event: 'Analysis', ...tags }
  const head = Object.entries(all).map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`)
  if (line.startFen !== START_FEN) head.push('[SetUp "1"]', `[FEN "${line.startFen}"]`)
  return `${head.join('\n')}\n\n${treeToPgn(lineTree(line))} *\n`
}

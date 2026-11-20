// The human {comments} of a PGN game, each on the position it speaks about, read
// straight from the moves: main line and variations. build-comment-db.mjs uses
// it for .pgn sources (Lichess studies), whose comments are already tied to a
// move and need no prose recognition.
//
// The package's own tokenizer (src/notation/sanTokenizer.ts) reads book prose,
// where braces open variations; PGN braces are comments, so PGN is walked here
// with chess.js, the engine the package builds its trees with.
import { Chess } from 'chess.js'
import { cleanGamePgn, headersOf, humanCommentText, splitPgnGames } from './harvest-lichess.mjs'

export { cleanGamePgn, splitPgnGames }

const TOKEN = /\{[^}]*\}|;[^\n]*|\(|\)|\$\d+|\d+\.(?:\.\.)?|(?:1-0|0-1|1\/2-1\/2|\*)(?=\s|$)|[^\s(){};]+/g
const RESULT = /^(?:1-0|0-1|1\/2-1\/2|\*)$/

/** Cut a long remark at the end of a sentence (as extractPositionComments does for books). */
function trim(text, max) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return end > max * 0.4 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`
}

/**
 * Every human comment of one PGN game with the position it speaks about:
 * a comment after a move is on the position after that move; a comment before
 * the first move of the game is on the start position (ply 0, move 0, san ''),
 * one before the first move of a variation on the position the variation
 * branches from. Clock, eval and arrow commands and engine-only notes are
 * removed; comments shorter than `minChars` are skipped. A line stops at an
 * illegal move.
 *
 * @returns {{ tags: Record<string,string>, moves: number,
 *   comments: { fen: string, ply: number, move: number, san: string, variation: boolean, text: string }[] }}
 */
export function pgnPositionComments(pgn, { minChars = 20, maxLength = 700 } = {}) {
  const tags = headersOf(pgn)
  const split = pgn.search(/\n\s*\n/)
  const movetext = pgn.startsWith('[') ? (split < 0 ? '' : pgn.slice(split)) : pgn
  let start
  try { start = new Chess(tags.FEN || undefined).fen() } catch { return { tags, moves: 0, comments: [] } }
  const root = { fen: start, ply: 0, move: 0, san: '' }
  const comments = []
  // A line: the node it starts from, the node its last move reached and the one before.
  let line = { from: root, node: root, prev: null, dead: false, depth: 0 }
  const stack = []
  let moves = 0
  for (const [token] of movetext.matchAll(TOKEN)) {
    if (token.startsWith('{')) {
      if (line.dead) continue
      const text = humanCommentText(token.slice(1, -1))
      if (!text || text.length < minChars) continue
      const at = line.node
      comments.push({ fen: at.fen, ply: at.ply, move: at.move, san: at.san, variation: line.depth > 0, text: trim(text, maxLength) })
    } else if (token === '(') {
      stack.push(line)
      // An alternative to the line's last move: it starts where that move was played.
      const from = line.prev ?? line.node
      line = { from, node: from, prev: null, dead: line.dead || !line.prev, depth: line.depth + 1 }
    } else if (token === ')') {
      if (stack.length) line = stack.pop()
    } else if (token.startsWith(';') || token.startsWith('$') || /^\d+\.(?:\.\.)?$/.test(token) || RESULT.test(token)) {
      continue
    } else if (!line.dead) {
      const san = token.replace(/^\d+\.+/, '').replace(/[!?]+$/, '')
      if (!san) continue
      const board = new Chess(line.node.fen)
      const fullMove = board.moveNumber()
      let played
      try { played = board.move(san) } catch { played = null }
      if (!played) { line.dead = true; continue }
      line.prev = line.node
      line.node = { fen: board.fen(), ply: line.node.ply + 1, move: fullMove, san: played.san }
      if (line.depth === 0) moves++
    }
  }
  return { tags, moves, comments }
}

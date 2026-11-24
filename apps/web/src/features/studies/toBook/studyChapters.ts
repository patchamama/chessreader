import { Chess } from 'chess.js'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** One main-line move of a study chapter, with everything said about it. */
export interface StudyMove {
  san: string
  /** The move as printed: "12. Nf3!", "12... Nf3?" (black moves carry the dots only when needed). */
  text: string
  ply: number
  fenBefore: string
  fenAfter: string
  /** UCI of the move (for comparing with the engine's choice). */
  uci: string
  /** ! and !! are good, ? and ?? are bad (suffix or NAG); everything else is neutral. */
  mark: 'good' | 'bad' | null
  comments: string[]
  /** Side lines as text, "(3. Bc4 Also possible. Bc5)": never main-line moves. */
  variations: string[]
}

export interface StudyChapter {
  name: string
  startFen: string
  /** Comments before the first move. */
  intro: string[]
  moves: StudyMove[]
}

type Token = { t: 'comment' | 'san' | 'open' | 'close' | 'nag' | 'number' | 'result'; v: string }

const TOKEN = /\{[^}]*\}|\(|\)|\$\d+|\d+\.(?:\.\.)?|\.\.\.|1-0|0-1|1\/2-1\/2|\*|[^\s(){}$]+/g

function tokenize(movetext: string): Token[] {
  const out: Token[] = []
  for (const raw of movetext.match(TOKEN) ?? []) {
    if (raw.startsWith('{')) out.push({ t: 'comment', v: raw.slice(1, -1) })
    else if (raw === '(') out.push({ t: 'open', v: raw })
    else if (raw === ')') out.push({ t: 'close', v: raw })
    else if (raw.startsWith('$')) out.push({ t: 'nag', v: raw })
    else if (/^(?:\d+\.(?:\.\.)?|\.\.\.)$/.test(raw)) out.push({ t: 'number', v: raw })
    else if (/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(raw)) out.push({ t: 'result', v: raw })
    else out.push({ t: 'san', v: raw })
  }
  return out
}

/** A comment as prose: engine, clock and drawing commands removed, spaces collapsed. */
export function cleanComment(raw: string): string {
  return raw.replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
}

const NAG_MARK: Record<string, string> = { $1: '!', $2: '?', $3: '!!', $4: '??', $5: '!?', $6: '?!' }

const markOf = (suffix: string): 'good' | 'bad' | null => (suffix === '!' || suffix === '!!' ? 'good' : suffix === '?' || suffix === '??' ? 'bad' : null)

/** A side line as the text of the book: its moves and comments, without braces. */
function variationText(tokens: Token[]): string {
  const parts: string[] = []
  for (const k of tokens) {
    if (k.t === 'comment') { const c = cleanComment(k.v); if (c) parts.push(c) }
    else if (k.t === 'nag') parts.push(NAG_MARK[k.v] ?? '')
    else if (k.t === 'open') parts.push('(')
    else if (k.t === 'close') parts.push(')')
    else parts.push(k.v)
  }
  // "(" and ")" hug their neighbours; a mark hugs its move.
  return parts.filter(Boolean).join(' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+([!?]+)/g, '$1')
}

function parseMoves(movetext: string, startFen: string): { intro: string[]; moves: StudyMove[] } {
  const tokens = tokenize(movetext)
  const intro: string[] = []
  const moves: StudyMove[] = []
  const chess = new Chess(startFen)
  let i = 0
  let dead = false
  while (i < tokens.length) {
    const k = tokens[i]
    const last = moves[moves.length - 1]
    if (k.t === 'comment') {
      const c = cleanComment(k.v)
      if (c) (last ? last.comments : intro).push(c)
      i++
    } else if (k.t === 'nag') {
      if (last && NAG_MARK[k.v]) {
        const m = markOf(NAG_MARK[k.v])
        if (m) last.mark = m
        last.text += NAG_MARK[k.v]
      }
      i++
    } else if (k.t === 'open') {
      let depth = 1
      let j = i + 1
      while (j < tokens.length && depth > 0) { depth += tokens[j].t === 'open' ? 1 : tokens[j].t === 'close' ? -1 : 0; j++ }
      if (last) last.variations.push(variationText(tokens.slice(i, j)))
      i = j
    } else if (k.t === 'san' && !dead) {
      const m = /^(.*?)([!?]{1,2})?$/.exec(k.v)
      const bare = m?.[1] ?? k.v
      const suffix = m?.[2] ?? ''
      const fenBefore = chess.fen()
      const color = chess.turn()
      const fullMove = Number(fenBefore.split(' ')[5]) || 1
      let played
      try { played = chess.move(bare) } catch { played = null }
      if (!played) { dead = true; i++; continue }
      const quiet = !last || (!last.comments.length && !last.variations.length)
      const dots = color === 'w' ? `${fullMove}.` : quiet && last ? '' : `${fullMove}...`
      moves.push({
        san: played.san, text: `${dots ? `${dots} ` : ''}${played.san}${suffix}`, ply: moves.length + 1,
        fenBefore, fenAfter: chess.fen(), uci: `${played.from}${played.to}${played.promotion ?? ''}`,
        mark: markOf(suffix), comments: [], variations: [],
      })
      i++
    } else i++
  }
  return { intro, moves }
}

/** The chapters of a study PGN (one game per chapter), main line and comments. */
export function parseStudyChapters(pgn: string): StudyChapter[] {
  const games = pgn.replace(/\r/g, '').split(/\n\n(?=\[)/).map((g) => g.trim()).filter(Boolean)
  const chapters: StudyChapter[] = []
  for (const game of games) {
    const split = game.search(/\n\s*\n/)
    const header = split >= 0 ? game.slice(0, split) : game
    const movetext = split >= 0 ? game.slice(split).trim() : ''
    const tag = (name: string) => new RegExp(`\\[${name} "([^"]*)"\\]`).exec(header)?.[1]?.trim() ?? ''
    let startFen = tag('FEN') || START_FEN
    let playable = startFen
    try { new Chess(startFen) } catch {
      // A text-only chapter has an empty board: keep it (no diagram), play from the standard start.
      playable = START_FEN
      if (hasPieces(startFen)) startFen = START_FEN
    }
    const players = [tag('White'), tag('Black')].filter((p) => p && p !== '?').join(' — ')
    const name = tag('ChapterName') || players || tag('Event') || `Chapter ${chapters.length + 1}`
    const { intro, moves } = parseMoves(movetext, playable)
    chapters.push({ name, startFen, intro, moves })
  }
  return chapters
}

/** Whether a position has any piece (the empty board of a text chapter has none). */
export const hasPieces = (fen: string): boolean => /[pnbrqkPNBRQK]/.test(fen.split(' ')[0] ?? '')

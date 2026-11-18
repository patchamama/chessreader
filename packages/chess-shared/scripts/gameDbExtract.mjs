// Pure helpers of scripts/build-game-db.mjs: the heading printed before a game
// (players, Elo, place, date, event, opening), how the game ended (from the
// words after its last move) and which image of an EPUB is its cover.
import { existsSync } from 'node:fs'
import { posix } from 'node:path'

const FEN = /^(?:[rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+(?:\s|$)/
/** Lines between the heading and the first move: move numbers, FEN, diagrams, engine lines. */
const NOISE = [/^\d+\s*(?:\.|…|\.\.\.)*$/, FEN, /^￼$/, /^Stockfish\b.*\beval\b/i, /^\(?Diagrama?\b/i, /^Posici[oó]n (?:despu[eé]s|tras)\b/i, /^Juegan (?:blancas|negras)$/i]

/** The lines before a game, without the noise that follows its heading. Two-column lines are split. */
export function headingLines(text) {
  const lines = text.split('\n').flatMap((l) => l.split(/\s{3,}/)).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  while (lines.length && NOISE.some((r) => r.test(lines[lines.length - 1]))) lines.pop()
  return lines
}

const ELO_PAIR = /^(.+?)\s*\((\d{4})\)\s*([-–—])\s*(.+?)\s*\((\d{4})\)$/
const elo = (s) => { const n = Number(s); return n >= 1000 && n <= 2900 ? n : null }
/** A short line that names a tournament or match ("Torneo de Candidatos", "25° Campeonato de la URSS"). */
const isLabel = (l) => l.length <= 60 && l.split(/\s+/).length <= 8 && !/[.:;?!]$/.test(l) && /^[\p{Lu}\d]/u.test(l) && !FEN.test(l)

/**
 * The heading of a game read with `parse` (chess-shared's parseGameHeader),
 * plus the Elo written after each name and a tournament line without a year,
 * which parseGameHeader stops at. Null when the lines are no heading.
 */
export function readGameHeading(rawLines, parse) {
  let whiteElo = null
  let blackElo = null
  const lines = rawLines.slice(-8).map((l) => {
    const m = ELO_PAIR.exec(l)
    if (!m || elo(m[2]) === null || elo(m[5]) === null) return l
    whiteElo = elo(m[2]); blackElo = elo(m[5])
    return `${m[1]}${m[3]}${m[4]}`
  })
  let work = lines
  let h = parse(work)
  const labels = []
  for (let tries = 0; tries < 2; tries++) {
    const idx = work.length - (h?.lines ?? 0) - 1
    if (idx < 1 || !isLabel(work[idx])) break
    const rest = [...work.slice(0, idx), ...work.slice(idx + 1)]
    const h2 = parse(rest)
    if (!h2 || h2.lines <= (h?.lines ?? 0)) break
    labels.unshift(work[idx]); work = rest; h = h2
  }
  if (!h) return null
  const event = [h.event, ...labels].filter(Boolean).join(' · ') || null
  return {
    white: h.white ?? null, black: h.black ?? null, place: h.place ?? null, date: h.date ?? null, year: h.year ?? null,
    event, opening: h.opening ?? null, eco: h.eco ?? null, whiteElo, blackElo,
  }
}

const RESIGN = /\b(?:abandon(?:a|an|ó|aron)|se rinden?|se rindi(?:ó|eron)|rindi(?:ó|eron)|resigns?|resigned)\s*[.!)]*\s*$/i
const TIME = /\b(?:pierden?|perdi(?:ó|eron)|lost|loses?)\s+(?:por|on)\s+(?:tiempo|time)\b|\bcay[óo]\s+(?:su\s+|la\s+)?bandera\b|\bflag fell\b/i
const MATE = /^\W*(?:y\s+|and\s+)?(?:jaque\s+)?mate\s*[.!]*$|\bcheckmate\b/i
const PERPETUAL = /\b(?:jaque\s+)?perpetuo\b|\bperpetual\b/i
const STALEMATE = /\bahogado\b|\bstalemate\b/i
const REPETITION = /\brepetici[oó]n\b|\brepetition\b/i
const DRAW = /^\W*(?:y\s+)?tablas\b|\bdraw(?:n| agreed| by agreement)?\s*[.!]*$/i
const LOSER = (l) => (/\b(?:blancas|white)\b/i.test(l) ? 'white' : /\b(?:negras|black)\b/i.test(l) ? 'black' : null)

/**
 * How a game ended, from the short lines just after its last move
 * ("y las negras abandonaron.", "Tablas por jaque perpetuo.", "1-0") and the
 * last move itself ("Qxf7#"). Fills the result when the words imply it.
 */
export function gameEnding(after, lastSan, result) {
  const lines = after.split('\n').map((l) => l.trim()).filter((l) => l && !NOISE.some((r) => r.test(l))).slice(0, 2).filter((l) => l.length <= 90)
  let termination = null
  let side = null
  for (const l of lines) {
    if (RESIGN.test(l)) { termination = 'resignation'; side = LOSER(l); break }
    if (TIME.test(l)) { termination = 'time'; side = LOSER(l); break }
    if (MATE.test(l)) { termination = 'checkmate'; break }
    if (PERPETUAL.test(l) && (DRAW.test(l) || /tablas|draw/i.test(l) || result === '½-½')) { termination = 'perpetual check'; break }
    if (STALEMATE.test(l)) { termination = 'stalemate'; break }
    if (REPETITION.test(l) && /tablas|draw/i.test(l)) { termination = 'repetition'; break }
    if (DRAW.test(l)) { termination = 'draw'; break }
  }
  if (!termination && lastSan?.endsWith('#')) termination = 'checkmate'
  if (!termination && result === '½-½') termination = 'draw'
  let r = result
  if (r === '*' && side) r = side === 'white' ? '0-1' : '1-0'
  if (r === '*' && ['draw', 'perpetual check', 'stalemate', 'repetition'].includes(termination)) r = '½-½'
  return { result: r, termination }
}

const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1], m[2] ?? m[3]]))
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => attrs(m[0]))
const isImage = (it) => /^image\//.test(it['media-type'] ?? '') || /\.(?:jpe?g|png|gif|webp)$/i.test(it.href ?? '')
const clean = (href) => { try { return decodeURIComponent(href.split('#')[0]) } catch { return href.split('#')[0] } }

/**
 * The cover image of an EPUB, as a path relative to its OPF file: the EPUB 3
 * manifest item with properties="cover-image", the EPUB 2 <meta name="cover">,
 * the image of the guide's cover page (read with `read(path)`), else the
 * first image. Null when the book has no image.
 */
export function coverHref(opf, read) {
  const items = tags(opf, 'item')
  const c3 = items.find((it) => (it.properties ?? '').split(/\s+/).includes('cover-image') && it.href)
  if (c3) return clean(c3.href)
  const id = tags(opf, 'meta').find((m) => m.name === 'cover')?.content
  const c2 = id && items.find((it) => it.id === id && it.href && isImage(it))
  if (c2) return clean(c2.href)
  const ref = tags(opf, 'reference').find((r) => /^cover$/i.test(r.type ?? '') && r.href)
  if (ref) {
    const page = clean(ref.href)
    if (isImage({ href: page })) return page
    const html = read?.(page)
    const src = html && (/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(html) ?? /<image\b[^>]*\b(?:xlink:)?href\s*=\s*["']([^"']+)["']/i.exec(html))?.[1]
    if (src) return posix.normalize(posix.join(posix.dirname(page), clean(src)))
  }
  const first = items.find((it) => it.href && isImage(it))
  return first ? clean(first.href) : null
}

// ── the game as the book wrote it: chapter, reader's game and remarks ────────

/**
 * A book text split into the reader's chapters (repoBooks.textBookChapters):
 * one per form feed, empty pieces skipped. `chapter` is the 1-based number the
 * reader uses (null for an empty piece); `text` is the piece untouched.
 */
export function bookChapters(text) {
  let n = 0
  return text.split('\f').map((piece) => ({ chapter: piece.replace(/\r/g, '').trim() ? ++n : null, text: piece }))
}

/**
 * The text the reader recognises in a chapter of a book text: textToChapters
 * makes one paragraph per line and htmlToProseText reads each paragraph as a
 * line with its whitespace collapsed. Game indexes computed on it are the
 * reader's (chapterErrors).
 */
export function chapterProse(piece) {
  return piece.replace(/\r/g, '').split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => p.replace(/\s+/g, ' ')).join('\n')
}

/** Engine evaluations and diagram marks of the resources text: not the author's words. */
const NOT_REMARK = [/Stockfish\s*\d*\s*eval:\s*\[[^\]]*\]/gi, /￼/g]
/** What may sit between a move and its remark, or between a remark and the next move: marks, brackets, move numbers. */
const LEAD = /^[\s!?)\],;.:]+/
const TRAIL = /(?:(?:^|[\s(])\d{1,3}\s*(?:\.{1,3}|…)?|[\s([]+)$/

/** The author's words between two moves, ready to go in braces (empty when there are none). */
function remark(raw) {
  let s = raw
  for (const re of NOT_REMARK) s = s.replace(re, ' ')
  s = s.replace(/\s+/g, ' ').replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'))
  for (let prev = ''; prev !== s;) { prev = s; s = s.replace(LEAD, '').replace(TRAIL, '') }
  s = balanced(s).replace(/\s+/g, ' ')
  for (let prev = ''; prev !== s;) { prev = s; s = s.replace(LEAD, '').replace(TRAIL, '') }
  return /[A-Za-zÀ-ÿ]{2}/.test(s) ? s.trim() : ''
}

/**
 * Text without its unmatched parentheses: the "(" that opens the variation a
 * remark introduces, the ")" that closes the one it ends. Left in a remark,
 * they would open or close a variation for whoever reads the PGN.
 */
function balanced(s) {
  const drop = new Set()
  const open = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') open.push(i)
    else if (s[i] === ')') { if (open.length) open.pop(); else drop.add(i) }
  }
  for (const i of open) drop.add(i)
  return [...s].filter((_, i) => !drop.has(i)).join('')
}

/**
 * A recognised game as PGN movetext with the book's remarks: the prose written
 * after each move (main line or variation) goes in braces after it, the
 * variations in parentheses. Same walk as chess-shared's treeToPgn, which
 * prints the moves only. Moves are in English SAN with the marks the book
 * gave them ("a6!?").
 */
export function commentedPgn(tree, text) {
  const written = [...tree.nodes.values()].filter((n) => n.charStart !== undefined && n.charEnd !== undefined).sort((a, b) => a.charStart - b.charStart)
  const after = new Map()
  // The prose after the last move runs into whatever follows the game: left out.
  for (let i = 0; i + 1 < written.length; i++) {
    const r = remark(text.slice(written[i].charEnd, written[i + 1].charStart))
    if (r) after.set(written[i].id, r)
  }
  const tokens = []
  const emitted = new Set()
  const move = (node) => node.san + (/(?:!!|\?\?|!\?|\?!|!|\?)$/.exec(node.rawSan ?? '')?.[0] ?? '')
  const emitLine = (ids, startsLine) => {
    if (emitted.has(ids)) return
    emitted.add(ids)
    let needNumber = startsLine
    ids.forEach((id, i) => {
      const node = tree.nodes.get(id)
      if (!node) return
      const number = node.color === 'white' ? `${node.moveNumber}. ` : needNumber || i === 0 ? `${node.moveNumber}... ` : ''
      tokens.push(number + move(node))
      needNumber = false
      if (after.has(id)) { tokens.push(`{${after.get(id)}}`); needNumber = true }
      const alts = (tree.variations.get(node.parentId ?? 'root') ?? []).filter((l) => l.length > 0 && l !== ids && !emitted.has(l) && l[0] !== id)
      const subs = i === ids.length - 1 ? (tree.variations.get(id) ?? []).filter((l) => l.length > 0 && l !== ids && !emitted.has(l)) : []
      for (const line of [...alts, ...subs]) {
        if (emitted.has(line)) continue
        const before = tokens.length
        tokens.push('(')
        emitLine(line, true)
        if (tokens.length === before + 1) tokens.pop()
        else { tokens.push(')'); needNumber = true }
      }
    })
  }
  emitLine(tree.mainline, true)
  let out = ''
  for (const t of tokens) {
    if (t === ')') out = out.replace(/\s+$/, '') + ')'
    else out += (out && !out.endsWith('(') ? ' ' : '') + t
  }
  return out.trim()
}

/** The number of remarks ({…}) of a PGN. */
export const commentCount = (pgn) => (pgn.match(/\{[^}]*\}/g) ?? []).length

/**
 * Which of a chapter's recognised games (their main-line SAN) is this
 * database game: the one sharing the longest opening of moves (at least six,
 * or the whole game when shorter), skipping the indexes in `taken`. Null when
 * none shares enough.
 */
export function matchGame(sans, games, taken = new Set()) {
  let best = null
  let bestLen = 0
  games.forEach((g, i) => {
    if (taken.has(i)) return
    let k = 0
    while (k < sans.length && k < g.length && sans[k] === g[k]) k++
    if (k > bestLen) { best = i; bestLen = k }
  })
  return bestLen >= Math.min(6, sans.length) && bestLen > 0 ? best : null
}

/**
 * The rows of a table of an existing database (e.g. the engine ratings of
 * players, which take hours to compute), read before the file is rebuilt.
 * `DatabaseSync` is passed in: test runners cannot import node:sqlite here.
 */
export function keptRows(DatabaseSync, file, table) {
  if (!existsSync(file)) return []
  const db = new DatabaseSync(file)
  try {
    return db.prepare(`SELECT * FROM ${table}`).all()
  } catch {
    return [] // an older file without that table
  } finally {
    db.close()
  }
}

/** Write rows read with keptRows back into the rebuilt table. */
export function restoreRows(db, table, rows) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const ins = db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
  for (const r of rows) ins.run(...cols.map((c) => r[c]))
}

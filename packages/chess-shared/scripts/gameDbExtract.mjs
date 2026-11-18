// Pure helpers of scripts/build-game-db.mjs: the heading printed before a game
// (players, Elo, place, date, event, opening), how the game ended (from the
// words after its last move) and which image of an EPUB is its cover.
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

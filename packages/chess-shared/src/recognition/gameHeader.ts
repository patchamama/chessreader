/**
 * The heading books print just before a game, read from its lines:
 *
 *   Partida 149
 *   M. Euwe-R. Réti
 *   Moscú (Blitz) 28.5.1992
 *   Amsterdam 1920, Match, 3ª partida
 *   Defensa Caro-Kann (B10)
 *
 * Any line may be missing and the order varies a little; reading stops at the
 * first line that is prose. Used to mark games in the reader and to fill the
 * game database (players, place, date, event, opening).
 */
export interface GameHeader {
  number?: number
  white?: string
  black?: string
  place?: string
  /** ISO date when the book gives day, month and year. */
  date?: string
  year?: number
  event?: string
  opening?: string
  eco?: string
  /** How many of the lines (counted from the last one) belong to the heading. */
  lines: number
}

const NUMBER = /^(?:Partida|Game|Partie|Spiel)\s+(?:n[º°o.]\s*)?(\d{1,4})\.?$/i
const ECO_LINE = /^(.{3,80}?)\s*\(([A-E]\d{2})\)\.?$/
const OPENING_WORDS = /^(?:Defensa|Apertura|Gambito|Ataque|Sistema|Variante|Contragambito|Opening|Defence|Defense|Gambit|Attack|System|Variation|Counter-?gambit|Verteidigung|Eröffnung|Gambit|Angriff)\b/i
const DATE = /\b(\d{1,2})\.(\d{1,2})\.(1[5-9]\d\d|20\d\d)\b/
const YEAR = /\b(1[5-9]\d\d|20\d\d)\b/
const NAME = "[A-ZÁÉÍÓÚÑÄÖÜÇŠŽČ][A-Za-zÁÉÍÓÚÑÄÖÜÇŠŽČáéíóúñäöüßçšžčćłńśźżàèìòùâêîôûëïÿ.'’ ]{0,38}"
const PAIR = new RegExp(`^(${NAME}?)\\s*[-–—]\\s*(${NAME})$`)

/** "T. Petrosian" for "T. PETROSIAN": books name the same player in capitals or not. */
const tidy = (n: string) => n.trim().replace(/\s+/g, ' ').split(' ')
  .map((w) => (w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w[0] + w.slice(1).toLowerCase() : w)).join(' ')

const isProse = (l: string) => l.length > 90 || (/[.:;]$/.test(l) && l.split(/\s+/).length > 8)

export function parseGameHeader(lines: string[]): GameHeader | null {
  const h: GameHeader = { lines: 0 }
  const seen = new Set<string>()
  for (let i = lines.length - 1; i >= 0 && lines.length - i <= 7; i--) {
    const l = lines[i].trim()
    if (!l) continue
    if (isProse(l)) break
    let m: RegExpExecArray | null
    if (!seen.has('number') && (m = NUMBER.exec(l))) { h.number = Number(m[1]); seen.add('number') }
    else if (!seen.has('opening') && (m = ECO_LINE.exec(l)) && !DATE.test(l)) { h.opening = m[1].trim(); h.eco = m[2]; seen.add('opening') }
    else if (!seen.has('date') && (m = DATE.exec(l))) {
      h.date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      h.year = Number(m[3])
      const place = l.slice(0, m.index).replace(/[,\s]+$/, '').trim()
      if (place) h.place = place
      seen.add('date')
    }
    else if (!seen.has('players') && !/\d/.test(l) && (m = PAIR.exec(l)) && m[1].trim().length > 2 && m[2].trim().length > 2) {
      h.white = tidy(m[1]); h.black = tidy(m[2]); seen.add('players')
    }
    else if (!seen.has('event') && (m = YEAR.exec(l)) && l.length <= 90) {
      h.event = l
      if (!seen.has('date')) {
        h.year = Number(m[1])
        const place = l.slice(0, m.index).replace(/[,\s]+$/, '').trim()
        if (place && !h.place) h.place = place
      }
      seen.add('event')
    }
    else if (!seen.has('opening') && OPENING_WORDS.test(l) && l.length <= 80 && !/\d/.test(l)) { h.opening = l.replace(/\.$/, ''); seen.add('opening') }
    else break
    h.lines = lines.length - i
  }
  if (!seen.size || (seen.size === 1 && seen.has('event'))) return null
  return Object.fromEntries(Object.entries(h).filter(([, v]) => v !== undefined)) as unknown as GameHeader
}

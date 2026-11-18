import { figurineToAscii } from '@chess-ebook/chess-shared'

/**
 * Piece letters of the books: English (K Q R B N), Spanish (R D T A C) and
 * German (K D T L S). A move is converted as a whole game, because "R" is a
 * rook in English and a king in Spanish: the letters the game uses decide.
 */
export type Notation = 'en' | 'es' | 'de'

const TO_EN: Record<Notation, Record<string, string>> = {
  en: {},
  es: { R: 'K', D: 'Q', T: 'R', A: 'B', C: 'N' },
  de: { K: 'K', D: 'Q', T: 'R', L: 'B', S: 'N' },
}
const FROM_EN: Record<Notation, Record<string, string>> = {
  en: {},
  es: { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' },
  de: { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' },
}
const FIGURINE: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' }

const lead = (m: string) => /^[A-Z](?=[a-h1-8]?x?[a-h][1-8])/.exec(figurineToAscii(m.trim()))?.[0]

/** Which piece letters a list of printed moves uses. */
export function detectNotation(printed: string[]): Notation {
  const count = (letters: string) => printed.filter((m) => { const l = lead(m); return !!l && letters.includes(l) }).length
  const en = count('NBQ')
  const de = count('SL')
  if (de > 0 && de >= en) return 'de'
  if (count('CA') > 0 && count('CA') >= en) return 'es'
  if (en === 0 && count('TD') > 0) return 'es'
  return 'en'
}

/** A printed move in English SAN: figurines and book letters converted, marks removed, 0-0 → O-O. */
export function printedToEnglish(move: string, notation: Notation): string {
  const s = figurineToAscii(move.trim()).replace(/[!?]+$/g, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O')
  if (/^O-O/.test(s)) return s
  return s.replace(/^[A-Z](?=[a-h1-8]?x?[a-h][1-8])/, (c) => TO_EN[notation][c] ?? c)
}

/** An English SAN move written like the book writes its moves (letters, figurines, castling with zeros). */
export function englishToPrinted(san: string, printed: string[]): string {
  const notation = detectNotation(printed)
  const zeros = printed.some((m) => /^0-0/.test(m.trim()))
  const figurines = printed.some((m) => /[♔-♟]/.test(m))
  if (/^O-O/.test(san)) return zeros ? san.replace(/O/g, '0') : san
  return san.replace(/^[KQRBN]/, (c) => (figurines ? FIGURINE[c] : FROM_EN[notation][c] ?? c))
}

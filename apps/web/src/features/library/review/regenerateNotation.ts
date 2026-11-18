import type { Lang } from '@chess-ebook/chess-shared'

/** Piece letters of each language → English (K Q R B N). */
const TO_ENGLISH: Partial<Record<Lang, Record<string, string>>> = {
  es: { R: 'K', D: 'Q', T: 'R', A: 'B', C: 'N' },
  de: { K: 'K', D: 'Q', T: 'R', L: 'B', S: 'N' },
}

/** A move token: piece letter, disambiguation, capture, square, promotion, check — not inside a word. */
const MOVE = (letters: string) => new RegExp(`(^|[\\s.(\\[,;:—-])([${letters}])([a-h]?[1-8]?x?[a-h][1-8](?:=[${letters}])?[+#]?)(?=$|[\\s!?.,;:)\\]])`, 'gm')

/** The chapter writes moves with English letters (N, B, Q only exist there). */
const usesEnglish = (text: string) => /(^|[\s.(])[NBQ][a-h1-8]?x?[a-h][1-8]/m.test(text)

/**
 * Regenerated commentary is written with the letters of the reader's language
 * ("Cf3" in Spanish). Put back into a book that prints "Nf3", those moves are
 * not read and the game stops there: write them with the chapter's letters.
 */
export function matchChapterLetters(body: string, lang: Lang, original: string): string {
  const map = TO_ENGLISH[lang]
  if (!map || !usesEnglish(original)) return body
  const letters = Object.keys(map).join('')
  return body.replace(MOVE(letters), (_m, pre: string, piece: string, rest: string) =>
    `${pre}${map[piece]}${rest.replace(/=([A-Z])/, (_p, c: string) => `=${map[c] ?? c}`)}`)
}

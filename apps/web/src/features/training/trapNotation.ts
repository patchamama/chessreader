import { localLine } from '@chess-ebook/chess-shared'
import { sanToFigurine } from '../../shared/stockfish/engineFormat'
import type { AppLanguage } from '../../shared/settings/settingsStore'

/**
 * Figurine notation chosen in Settings. The setting may not exist yet (another
 * part of the app adds it), so any of its likely shapes is accepted.
 */
export function figurinesOn(settings: unknown): boolean {
  const s = (settings ?? {}) as Record<string, unknown>
  return s.notationStyle === 'figurine' || s.figurines === true || s.figurineNotation === true || s.notation === 'figurine' || s.pieceNotation === 'figurine'
}

/** A SAN move written with the piece letters of the language, or with figurines. */
export function localSan(san: string, lang: AppLanguage, figurines: boolean): string {
  return figurines ? sanToFigurine(san) : localLine(san, lang)
}

/** A line of SAN moves in the notation of the settings ("1. e4 e5 2. Ac4"). */
export function localText(text: string, lang: AppLanguage, figurines: boolean): string {
  return figurines ? text.replace(/(^|\s)([KQRBN])(?=[a-h1-8x])/g, (_m, sp: string, c: string) => `${sp}${sanToFigurine(c)}`) : localLine(text, lang)
}

const WRONG: Record<AppLanguage, (move: string) => string> = {
  en: (m) => `Not the trap's move. It was ${m}.`,
  es: (m) => `No es la jugada de la celada. Era ${m}.`,
  de: (m) => `Nicht der Zug der Falle. Es war ${m}.`,
}

/** What a wrong move during practice says: the move it was, already written in the notation. */
export function wrongMoveText(lang: AppLanguage, move: string): string {
  return (WRONG[lang] ?? WRONG.en)(move)
}

import type { AppLanguage } from '../../../shared/settings/settingsStore'

/** Piece letters of each language in the order of the figurines ♔♕♖♗♘ (king, queen, rook, bishop, knight). */
const LETTERS: Record<AppLanguage, string> = { en: 'KQRBN', es: 'RDTAC', de: 'KDTLS' }

/**
 * A stored comment (its moves are figurines, a notation that needs no
 * translation) written in the notation the reader chose: figurines as they
 * are, or the piece letters of the reader's language.
 */
export function commentInNotation(text: string, lang: AppLanguage, figurines: boolean): string {
  if (figurines) return text
  const letters = LETTERS[lang] ?? LETTERS.en
  return text.replace(/[♔♕♖♗♘♚♛♜♝♞]/gu, (g) => letters['♔♕♖♗♘'.indexOf(g) >= 0 ? '♔♕♖♗♘'.indexOf(g) : '♚♛♜♝♞'.indexOf(g)])
}

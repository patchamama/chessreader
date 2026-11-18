import { describe, expect, it } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { matchChapterLetters } from './regenerateNotation'

const ORIGINAL = 'Partida 1\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7'
// What the commentary generator writes in Spanish: Spanish piece letters.
const SPANISH = '1. e4\nLucha por el centro.\n1... e5\n2. Cf3\nDesarrolla.\n2... Cc6\n3. Ab5 a6\n4. Aa4 Cf6\n5. O-O Ae7\nEl rey está seguro: el Rey blanco y la Dama esperan.'

describe('regenerated commentary inside a book (S6)', () => {
  it('writes the moves with the letters the chapter uses, so the whole game is read and highlighted', () => {
    const chapter = `Some prose before.\n${matchChapterLetters(SPANISH, 'es', ORIGINAL)}\nOther prose and 1. d4 d5 2. c4 later.`
    const [g] = recognizeGames(chapter, { algorithm: 2 })
    expect(g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'])
    // Prose words keep their letters.
    expect(matchChapterLetters(SPANISH, 'es', ORIGINAL)).toContain('el Rey blanco y la Dama esperan.')
  })

  it('leaves the text alone when the chapter uses the language letters, and converts German too', () => {
    expect(matchChapterLetters(SPANISH, 'es', '1. e4 e5 2. Cf3 Cc6')).toBe(SPANISH)
    expect(matchChapterLetters('2. Sf3 Sc6 3. Lb5 Dd8 4. Te1 Kf8', 'de', ORIGINAL)).toBe('2. Nf3 Nc6 3. Bb5 Qd8 4. Re1 Kf8')
  })
})

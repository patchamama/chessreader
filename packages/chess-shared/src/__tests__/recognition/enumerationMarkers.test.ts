import { describe, it, expect } from 'vitest'
import { tokenize } from '../../notation/sanTokenizer.js'
import { recognizeGames } from '../../recognition/recognizeGames.js'
import { spanishToEnglish } from '../../notation/spanishToEnglish.js'

const sans = (g: ReturnType<typeof recognizeGames>[number]) => g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)
const moveRaws = (text: string) => tokenize(text).filter((t) => t.type === 'move').map((t) => t.raw)

describe('enumeration markers at the start of a line are not moves (S5)', () => {
  it('"a1)", "b2)", "c1)" leading a line are labels, not moves', () => {
    const text = [
      'a) 12 Nf3 Nc6 13 Be2',
      'a1) 13 Bd3 Nf6',
      'b2) 13 Bb5 a6',
      'c1) 13 Qe2 Qe7',
    ].join('\n')
    expect(moveRaws(text)).toEqual(['Nf3', 'Nc6', 'Be2', 'Bd3', 'Nf6', 'Bb5', 'a6', 'Qe2', 'Qe7'])
  })

  it('a marker after leading spaces is still a label', () => {
    expect(moveRaws('   b2) 12 e4 e5')).toEqual(['e4', 'e5'])
  })

  it('the same squares closing a bracketed variation are still moves', () => {
    expect(moveRaws('13 Bb3 (13 Ba4 b5 14 Bb3 b2) 13...b5')).toEqual(['Bb3', 'Ba4', 'b5', 'Bb3', 'b2', 'b5'])
  })

  it('a square written mid-line before a stray ")" is still read as a move', () => {
    expect(moveRaws('12 Nf3 b2) and more')).toContain('b2')
  })

  it('a book line with markers keeps the game and reads no marker as a move', () => {
    const text = spanishToEnglish([
      '1 e4 e5 2 Cf3 Cc6 3 Ab5 a6 4 Aa4 Cf6 5 O-O Ae7',
      'Ahora las negras tienen dos planes:',
      'a1) 6 Te1 b5 7 Ab3 d6, la línea principal;',
      'b2) 6 d4 exd4 7 e5 Ce4, más agudo.',
      '6 Te1 b5 7 Ab3 d6',
    ].join('\n'))
    const games = recognizeGames(text, { algorithm: 2 })
    expect(games).toHaveLength(1)
    expect(sans(games[0])).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'])
    const nodes = [...games[0].tree.nodes.values()]
    for (const marker of ['a1)', 'b2)']) {
      const at = text.indexOf(marker)
      expect(nodes.some((n) => n.charStart === at)).toBe(false)
    }
  })
})

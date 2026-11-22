import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'
import { mainlineNodes } from '../../model/gameTree.js'

const HEAD = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 '

describe('unplaced variation moves', () => {
  it('lists an illegal variation move and the ones after it', () => {
    const text = HEAD + '(3... Nf6 4. Kh8 Nxe4 5. Bxc6) 6. Re1'
    const tree = recognizeGames(text)[0].tree
    const list = tree.unplacedVariationMoves
    expect(list.length).toBeGreaterThanOrEqual(2)
    const first = list[0]
    expect(first.reason).toBe('illegal')
    expect(text.slice(first.charStart, first.charEnd)).toContain('Kh8')
    expect(list[1].reason).toBe('after-illegal')
    expect(text.slice(list[1].charStart, list[1].charEnd)).toContain('Nxe4')
  })

  it('lists nothing for a legal variation and keeps the main line', () => {
    const text = HEAD + '(3... Nf6 4. d3 d6) 6. Re1'
    const tree = recognizeGames(text)[0].tree
    expect(tree.unplacedVariationMoves).toEqual([])
    expect(mainlineNodes(tree).map((n) => n.san).slice(0, 4)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })

  it('does not add recognition errors for the listed moves', () => {
    const t = recognizeGames(HEAD + '(3... Nf6 4. Kh8 Nxe4) 6. Re1')[0].tree
    // Only the pre-existing report (first unplaced numbered move is not repeated for Kh8).
    expect(t.errors.map((e) => e.san)).toEqual(['Nxe4'])
  })
})

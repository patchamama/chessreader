import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'
import { spanishToEnglish } from '../../notation/spanishToEnglish.js'

const sans = (g: ReturnType<typeof recognizeGames>[number]) => g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)

describe('dashed square pairs: plans in prose, or moves in long notation (S4)', () => {
  it('a plan written "d4-d5" or "Ac8-b7" in the prose is not a move of the game', () => {
    const text = spanishToEnglish([
      '1 e4 e5 2 Cf3 Cc6 3 Ab5 a6',
      'Las negras preparan b7-b5 y Ac8-b7; si 3…Cf6, entonces 4 O-O y d2-d4.',
      '4 Aa4 Cf6',
    ].join('\n'))
    const [g] = recognizeGames(text, { algorithm: 2 })
    expect(sans(g)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'])
    expect(g.tree.errors).toEqual([])
  })

  it('moves written in long notation are read as moves', () => {
    const text = '1. e2-e4 e7-e5 2. Ng1-f3 Nb8-c6 3. Bf1-b5 a7-a6 4. Bb5xc6 d7xc6'
    const [g] = recognizeGames(text, { algorithm: 2 })
    expect(sans(g)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6'])
    expect(g.tree.errors).toEqual([])
  })
})

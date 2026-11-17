import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'

describe('"…, o 4.d3 …": a second branch inside a prose variation (Bronstein book)', () => {
  const text = '1.e4 e5 2.Cf3 Cc6 3.Ab5 a6\nA 3...Cf6 sigue 4.0-0 Cxe4, o 4.d3 d6 y la partida es igual.\n4.Aa4 Cf6'
  const [g] = recognizeGames(text, { algorithm: 2 })
  const node = (san: string) => [...g.tree.nodes.values()].find((n) => n.san === san)!
  it('branches from the same point of the variation, not after its last move', () => {
    const nf6 = [...g.tree.nodes.values()].find((n) => n.san === 'Nf6' && !g.tree.mainline.includes(n.id))!
    expect(node('d3').parentId).toBe(nf6.id)
    expect(node('d6').parentId).toBe(node('d3').id)
    expect(g.tree.errors).toEqual([])
    expect(g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'])
  })
})

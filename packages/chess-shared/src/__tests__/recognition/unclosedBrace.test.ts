import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'

describe('a "{" that is never closed (open limit)', () => {
  it('ends at the end of its paragraph, so the game goes on', () => {
    const [g] = recognizeGames('1. e4 e5 2. Nf3 Nc6 { a remark never closed\n3. Bb5 a6 4. Ba4 Nf6', { algorithm: 2 })
    expect(g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'])
    expect(g.tree.errors).toEqual([])
  })
  it('a closed comment over two lines is still one comment', () => {
    const [g] = recognizeGames('1. e4 e5 2. Nf3 { a remark\nthat goes on 2... d6 } 2... Nc6 3. Bb5', { algorithm: 2 })
    expect(g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])
  })
})

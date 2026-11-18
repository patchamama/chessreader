import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPatternIndex, patternPuzzle } from './patterns'

afterEach(() => vi.unstubAllGlobals())

describe('pattern trainer data (S4)', () => {
  it('lists the themes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ themes: [{ theme: 'fork', en: 'Fork', es: 'Ataque doble', count: 120 }] }), { status: 200 })))
    await expect(loadPatternIndex()).resolves.toEqual([{ theme: 'fork', en: 'Fork', es: 'Ataque doble', count: 120 }])
  })

  it('a puzzle of the theme starts after the opponent move, near the rating asked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      ['00008', 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24', 'f2g3 e6e7 b2b1 b3c1 b1c1 h6c1', 1819],
      ['easy', '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1', 'g8h8 a1a8', 600],
    ]), { status: 200 })))
    const p = await patternPuzzle('fork', 1800, () => 0)
    expect(p).toMatchObject({ id: '00008', rating: 1819, lastMove: 'f2g3', solution: ['e6e7', 'b2b1', 'b3c1', 'b1c1', 'h6c1'], themes: ['fork'] })
    expect(p.fen.split(' ')[1]).toBe('w')
  })
})

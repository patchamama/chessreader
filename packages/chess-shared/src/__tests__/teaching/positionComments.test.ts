import { describe, it, expect } from 'vitest'
import { recognizeGames } from '../../recognition/recognizeGames.js'
import { spanishToEnglish } from '../../notation/spanishToEnglish.js'
import { extractPositionComments, positionKey, positionHash } from '../../commentdb/positionComments.js'

const TEXT = spanishToEnglish([
  'Partida 12',
  'M. Botvinnik - M. Tal',
  '1 e4 c6 2 d4 d5 3 Cc3 dxe4 4 Cxe4 Af5 5 Cg3 Ag6 6 h4 h6 7 Cf3 Cd7',
  'Las negras completan el desarrollo del flanco de dama antes de decidir dónde enrocarse; es la idea clásica de Capablanca.',
  '8 h5 Ah7 9 Ad3',
  '9 Ad3 Axd3 10 Dxd3.',
  '9…Axd3 10 Dxd3 e6',
  'Ahora la dama blanca domina la diagonal b1-h7 y el enroque largo es lo natural para las blancas.',
  '11 Af4',
].join('\n'))

describe('position comments from a book (S5)', () => {
  const [game] = recognizeGames(TEXT, { algorithm: 2 })
  const comments = extractPositionComments(TEXT, game, { lang: 'es' })

  it('pairs each remark of the author with the position it speaks about', () => {
    expect(comments.map((c) => [c.ply, c.san])).toEqual([[14, 'Nd7'], [20, 'e6']])
    expect(comments[0].text).toMatch(/^Las negras completan el desarrollo/)
    expect(comments[0].key).toBe(positionKey(game.tree.nodes.get(game.tree.mainline[13])!.fen))
    expect(comments[1].text).toMatch(/diagonal b1-h7/)
  })

  it('a line of moves without words is not a comment', () => {
    expect(comments.some((c) => /^9 Bd3 Bxd3/.test(c.text))).toBe(false)
  })

  it('keys ignore the move counters, and the hash is short and stable', () => {
    expect(positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -')
    expect(positionHash('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe(positionHash('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 5 9'))
    expect(positionHash('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('analysis that is mostly moves, with a few words, is not a remark', () => {
    const t = spanishToEnglish(['1 e4 c6 2 d4 d5 3 Cc3 dxe4 4 Cxe4 Af5 5 Cg3 Ag6',
      '5…e6 6 a4 c5 6…b4 (Miles). 7 dxc5 7 c3 c4 8 Ac2 d5 (Miles). 7…Axc5 8 Cbd2 b4 9 e5 Cd5 10 Ce4 Ae7 11 O-O?! 11 Ag5',
      '6 h4 h6'].join('\n'))
    const [g] = recognizeGames(t, { algorithm: 2 })
    expect(extractPositionComments(t, g, { lang: 'es' })).toEqual([])
  })
})

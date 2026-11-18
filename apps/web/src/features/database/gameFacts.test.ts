import { describe, expect, it } from 'vitest'
import { gameFacts, pgnFacts } from './gameFacts'

describe('game facts (S3)', () => {
  it('moves, how it ended, Elo, place and event, each only when known', () => {
    expect(gameFacts({ moves: 40, result: '1-0', termination: 'resignation', whiteElo: 2650, blackElo: 2620, place: 'Riga', event: 'Riga 1954 · Copa de la URSS' }))
      .toEqual(['40 moves', '1-0 (resignation)', 'Elo 2650–2620', 'Riga 1954 · Copa de la URSS'])
    expect(gameFacts({ moves: 31, result: '*', termination: 'checkmate', whiteElo: null, blackElo: 2400, place: 'Moscú', event: null }))
      .toEqual(['31 moves', 'checkmate', 'Elo ?–2400', 'Moscú'])
    expect(gameFacts({ moves: 12, result: '*' })).toEqual(['12 moves'])
  })
  it('from a PGN: tags, moves and a mate on the board', () => {
    const pgn = '[Event "Live Chess"]\n[Site "Chess.com"]\n[Result "1-0"]\n[WhiteElo "1510"]\n[BlackElo "1480"]\n[Termination "x won by resignation"]\n\n1. e4 {best} e5 (1... c5 2. Nf3) 2. Qh5 Nc6 3. Bc4 Nf6?? 4. Qxf7# 1-0'
    expect(pgnFacts(pgn)).toEqual({ moves: 4, result: '1-0', termination: 'resignation', whiteElo: 1510, blackElo: 1480, place: 'Chess.com', event: 'Live Chess' })
    expect(pgnFacts('[Event "?"]\n\n1. f3 e5 2. g4 Qh4#')).toEqual({ moves: 2, result: '0-1', termination: 'checkmate', whiteElo: null, blackElo: null, place: null, event: null })
  })
})

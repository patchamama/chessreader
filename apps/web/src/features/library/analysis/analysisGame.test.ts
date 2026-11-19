import { describe, expect, it } from 'vitest'
import { gameFromText, lineAfterMove, lineOfBoard, lineToPgn, lineTree } from './analysisGame'
import { START_FEN } from './analysisLine'

const FEN = '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1'

describe('analysis game (S10: free play, typed games and their FEN)', () => {
  it('reads a typed PGN or book-like text as a line from the start', () => {
    expect(gameFromText('1. e4 e5 2. Nf3 {a comment} Nc6 3. Bb5')).toEqual({ startFen: START_FEN, moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'] })
    expect(gameFromText('1.e4 c5 2.Cf3 d6')?.moves).toEqual(['e2e4', 'c7c5', 'g1f3', 'd7d6'])
    expect(gameFromText('1. d4')).toEqual({ startFen: START_FEN, moves: ['d2d4'] })
  })

  it('a FEN line in the text starts the game from that position, as books print it', () => {
    expect(gameFromText(`${FEN}\n1. Re8#`)).toEqual({ startFen: FEN, moves: ['e1e8'] })
    expect(gameFromText(`[FEN "${FEN}"]\n\n1. Re8# 1-0`)).toEqual({ startFen: FEN, moves: ['e1e8'] })
    // Only a position: no moves yet.
    expect(gameFromText(FEN)).toEqual({ startFen: FEN, moves: [] })
  })

  it('text without any move nor position is not a game', () => {
    expect(gameFromText('just some words')).toBeNull()
    expect(gameFromText('')).toBeNull()
  })

  it('a move played on the board continues the line from the move shown, dropping what followed', () => {
    const line = { startFen: START_FEN, moves: ['e2e4', 'e7e5', 'g1f3'] }
    expect(lineAfterMove(line, 3, 'b8', 'c6')).toEqual({ startFen: START_FEN, moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] })
    expect(lineAfterMove(line, 1, 'c7', 'c5')).toEqual({ startFen: START_FEN, moves: ['e2e4', 'c7c5'] })
    // The move the line already has next: nothing is dropped.
    expect(lineAfterMove(line, 1, 'e7', 'e5')).toEqual(line)
    expect(lineAfterMove(line, 3, 'e2', 'e5')).toBeNull()
  })

  it('the line of a board opened from a book (moves or PGN), and its tree and PGN', () => {
    expect(lineOfBoard({ title: 'x', startFen: START_FEN, moves: ['e4', 'e5'] })).toEqual({ startFen: START_FEN, moves: ['e2e4', 'e7e5'] })
    expect(lineOfBoard({ title: 'x', pgn: '1. d4 {quiet} d5 (1... Nf6) *' }).moves).toEqual(['d2d4', 'd7d5'])
    const tree = lineTree({ startFen: FEN, moves: ['e1e8'] })
    expect(tree.mainline.map((id) => tree.nodes.get(id)?.san)).toEqual(['Re8#'])
    expect(lineToPgn({ startFen: FEN, moves: ['e1e8'] })).toContain(`[FEN "${FEN}"]`)
    expect(lineToPgn({ startFen: START_FEN, moves: ['e2e4'] })).not.toContain('[FEN')
    expect(lineToPgn({ startFen: START_FEN, moves: ['e2e4'] })).toMatch(/1\. ?e4/)
  })
})

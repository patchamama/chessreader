import { describe, expect, it } from 'vitest'
import { actionCues, actionSchedule, cuesAt, parseActions, serializeActions, validateActions, wordIndexAt, narrationWords } from './actions.js'
import { positionFacts } from './positionFacts.js'

// The sample game of S6: a Spanish opening course, comments in Spanish (invented text and position).
// 1.e4 e5 2.Nf3 d6 — a comment on Black's plan, with Black to move.
const FEN = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 3'
const COMMENT = 'Despejando la diagonal de nuestro alfil de casillas blancas y preparando el avance f5!'

describe('parseActions / serializeActions: "0Diagonal:c8-h3, 1Arrow:f7-f5" (S6)', () => {
  it('reads the user\'s example into token-indexed actions', () => {
    const { actions, errors } = parseActions('0Diagonal:c8-h3, 1Arrow:f7-f5')
    expect(errors).toEqual([])
    expect(actions).toEqual([
      { at: 0, kind: 'Diagonal', from: 'c8', to: 'h3' },
      { at: 1, kind: 'Arrow', from: 'f7', to: 'f5' },
    ])
    expect(serializeActions(actions)).toBe('0Diagonal:c8-h3, 1Arrow:f7-f5')
  })

  it('reads every action kind and writes it back canonically', () => {
    const src = '0Square:e4, 2Squares:e4|e5, 3Arrow:f7-f5, 4Diagonal:c8-h3, 5Line:a1-a8, 6Piece:c8, 9Clear'
    const { actions, errors } = parseActions(src)
    expect(errors).toEqual([])
    expect(actions.map((a) => a.kind)).toEqual(['Square', 'Squares', 'Arrow', 'Diagonal', 'Line', 'Piece', 'Clear'])
    expect(actions[1]).toEqual({ at: 2, kind: 'Squares', squares: ['e4', 'e5'] })
    expect(serializeActions(actions)).toBe(src)
  })

  it('tolerates case, spaces and a missing space after the comma, and keeps the order by token index', () => {
    const { actions } = parseActions('3arrow:F7-F5,0 diagonal:c8-h3')
    expect(serializeActions(actions)).toBe('0Diagonal:c8-h3, 3Arrow:f7-f5')
  })

  it('reports what it cannot read and keeps the rest', () => {
    const { actions, errors } = parseActions('0Fly:c8-h3, Arrow:f7-f5, 1Arrow:z9-f5, 2Arrow:f7, 3Clear')
    expect(actions).toEqual([{ at: 3, kind: 'Clear' }])
    expect(errors).toHaveLength(4)
    expect(parseActions('')).toEqual({ actions: [], errors: [] })
  })
})

describe('validateActions: against the position', () => {
  const ok = (src: string) => validateActions(parseActions(src).actions, FEN, { words: 14 })
  it('keeps the user\'s example on the position of the comment', () => {
    const { valid, rejected } = ok('0Diagonal:c8-h3, 1Arrow:f7-f5')
    expect(rejected).toEqual([])
    expect(valid).toHaveLength(2)
  })

  it('discards squares that are not on a diagonal / line, arrows from an empty square and pieces that are not there', () => {
    const { valid, rejected } = ok('0Diagonal:c8-h4, 1Line:a1-b3, 2Arrow:e3-e5, 3Piece:c5, 4Arrow:f7-f7, 5Piece:c8')
    expect(valid.map((a) => a.kind)).toEqual(['Piece'])
    expect(rejected.map((r) => r.reason)).toEqual(['not-a-diagonal', 'not-a-line', 'no-piece-on-origin', 'no-piece', 'same-square'])
  })

  it('discards an action at a token the comment does not have', () => {
    const { valid, rejected } = ok('14Square:e4, 13Square:e4')
    expect(valid.map((a) => a.at)).toEqual([13])
    expect(rejected[0].reason).toBe('token-out-of-range')
  })
})

describe('the runner: actions to board marks while the comment is narrated (S6)', () => {
  const { actions } = parseActions('0Diagonal:c8-h3, 1Arrow:f7-f5')
  const squares = (index: number) => cuesAt(actions, index).flatMap((c) => c.squares.map((s) => `${s.role}:${s.square}`)).sort()

  it('reproduces "iluminar casillas desde c8-h3 y flecha f7-f5" for the f5 comment', () => {
    // "…alfil de casillas blancas y preparando el avance f5!": the diagonal at the start, the arrow at f5!
    const at = narrationWords(COMMENT).findIndex((w) => w === 'f5!')
    expect(at).toBe(13)
    expect(wordIndexAt(COMMENT, COMMENT.indexOf('f5!'))).toBe(13)
    const timed = parseActions(`0Diagonal:c8-h3, ${at}Arrow:f7-f5`).actions
    expect(validateActions(timed, FEN, { words: narrationWords(COMMENT).length }).rejected).toEqual([])
    expect(cuesAt(timed, 5).flatMap((c) => c.arrows)).toEqual([])
    expect(cuesAt(timed, 5).flatMap((c) => c.squares.map((s) => s.square))).toEqual(['c8', 'd7', 'e6', 'f5', 'g4', 'h3'])
    expect(cuesAt(timed, at).flatMap((c) => c.arrows)).toEqual([{ from: 'f7', to: 'f5', role: 'to' }])
  })

  it('shows the diagonal first, and the arrow with its two squares when it is reached', () => {
    expect(squares(0)).toEqual(['line:c8', 'line:d7', 'line:e6', 'line:f5', 'line:g4', 'line:h3'])
    expect(squares(1)).toEqual(['from:f7', 'line:c8', 'line:d7', 'line:e6', 'line:f5', 'line:g4', 'line:h3', 'to:f5'])
    expect(cuesAt(actions, 1).flatMap((c) => c.arrows)).toEqual([{ from: 'f7', to: 'f5', role: 'to' }])
  })

  it('draws a rank or file, a piece and squares, and Clear wipes what came before', () => {
    const more = parseActions('0Line:a1-a8, 1Piece:c8, 2Squares:e4|e5, 3Clear, 4Square:d4').actions
    expect(cuesAt(more, 2).map((c) => c.kind)).toEqual(['line', 'piece', 'square'])
    expect(cuesAt(more, 3)).toEqual([])
    expect(cuesAt(more, 4).flatMap((c) => c.squares.map((s) => s.square))).toEqual(['d4'])
  })

  it('schedules the cues by token, flagging the Clear', () => {
    const sched = actionSchedule(parseActions('0Diagonal:c8-h3, 1Arrow:f7-f5, 1Square:e4, 5Clear').actions)
    expect(sched.map((s) => [s.at, s.clear, s.cues.length])).toEqual([[0, false, 1], [1, false, 2], [5, true, 0]])
    expect(actionCues(parseActions('0Piece:c8').actions[0])[0].squares).toEqual([{ square: 'c8', role: 'piece' }])
  })
})

describe('positionFacts: what the AI is told about the position (S6)', () => {
  const facts = positionFacts(FEN)
  const bishop = facts.pieces.find((p) => p.square === 'c8')!

  it('lists the side to move and its legal moves per piece, with the reach of the sliders', () => {
    expect(facts.turn).toBe('b')
    expect(bishop).toMatchObject({ piece: 'b', color: 'b' })
    expect(bishop.moves).toEqual(['d7', 'e6', 'f5', 'g4', 'h3'])
    expect(bishop.rays).toEqual([{ kind: 'diagonal', from: 'c8', to: 'h3' }])
    const pawn = facts.pieces.find((p) => p.square === 'f7')!
    expect(pawn.moves).toEqual(['f5', 'f6'])
  })

  it('also lists the other side, as if it were to move, and survives an unreadable FEN', () => {
    expect(facts.pieces.find((p) => p.square === 'f1')!.moves).toEqual(['a6', 'b5', 'c4', 'd3', 'e2'])
    expect(positionFacts('nope').pieces).toEqual([])
  })
})

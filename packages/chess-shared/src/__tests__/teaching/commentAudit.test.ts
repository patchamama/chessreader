import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { auditMotif, auditGame, type PlyInput, reviewGame } from '../../index.js'

function plies(moves: string): PlyInput[] {
  const c = new Chess()
  return moves.split(' ').map((san, i) => {
    const fenBefore = c.fen()
    const m = c.move(san)
    return {
      nodeId: `n${i}`, san: m.san, from: m.from, to: m.to, fenBefore, fenAfter: c.fen(),
      color: m.color === 'w' ? 'white' : 'black', moveNumber: Math.floor(i / 2) + 1,
      before: { cp: 0 }, after: { cp: 0 },
    } as PlyInput
  })
}

describe('commentary audit (S26)', () => {
  const game = plies('e4 d5 exd5 Qxd5 Nc3 Qa5')
  it('flags "the file is open for the rooks" when the side has no rook', () => {
    const p = plies('e4 d5 exd5')
    const noRooks = { ...p[2], fenAfter: '4k3/8/8/3P4/8/8/8/6K1 b - - 0 1' }
    expect(auditMotif({ kind: 'open-file', square: 'd5', squares: [], data: { file: 'e' } }, [noRooks], 0)).toMatch(/no rook/)
  })
  it('flags "wins material" when the material is even two moves later', () => {
    expect(auditMotif({ kind: 'wins-material', square: 'd5', squares: [], data: { piece: 'p' } }, game, 2)).toMatch(/material/)
  })
  it('flags a pin by a piece that is simply taken', () => {
    const fen = '6k1/8/8/8/3Qr3/8/P3B2P/4K3 w - - 0 1'
    const p = [{ ...game[0], color: 'black', fenBefore: '4r1k1/8/8/8/3QR3/8/P3B2P/4K3 b - - 0 1', fenAfter: fen, to: 'e4', san: 'Rxe4' } as PlyInput]
    expect(auditMotif({ kind: 'pin', square: 'e4', squares: ['e2', 'e1'], data: { piece: 'b', behind: 'k' } }, p, 0)).toMatch(/lost/)
  })
  it('a clean game gives no findings', () => {
    const g = plies('e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6 d3 d6')
    expect(auditGame(g, reviewGame(g))).toEqual([])
  })
})

describe('audit of the opponent overload', () => {
  it('accepts an overload of the opponent piece', async () => {
    const { moveMotifs } = await import('../../index.js')
    const fen = '1r2k3/8/8/6b1/3Q4/8/1N3N2/7K b - - 0 1'
    const c = new Chess(fen); const mv = c.move('Bh4')
    const p = [{ nodeId: 'a', san: 'Bh4', from: mv.from, to: mv.to, fenBefore: fen, fenAfter: c.fen(), color: 'black', moveNumber: 1, before: { cp: 0 }, after: { cp: 0 } } as PlyInput]
    const o = moveMotifs(fen, 'Bh4').find((x) => x.kind === 'overloaded')!
    expect(auditMotif(o, p, 0)).toBeNull()
  })
})

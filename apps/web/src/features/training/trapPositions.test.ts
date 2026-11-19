import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { trapContinuations, trapIndex, trapsAt, type Trap } from './traps'

const line = (moves: string) => { const c = new Chess(); const keys = [positionHash(c.fen())]; const sans = moves.split(' ').map((m) => { const r = c.move(m); keys.push(positionHash(c.fen())); return r.san }); return { sans, keys } }
const base = { category: 'Classic traps', trapMove: 3, setup: 3, fall: 3, tactic: 2, themes: [], intro: '', source: { title: 'x', author: null } }
const scholar: Trap = { ...base, id: 's', title: "Scholar's mate", opening: 'Italian Game', side: 'white', fall: 4, ...line('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#') }
const blackburne: Trap = { ...base, id: 'b', title: 'Blackburne', opening: 'Italian Game', side: 'black', ...line('e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5') }
const fenOf = (moves: string) => { const c = new Chess(); for (const m of moves.split(' ')) c.move(m); return c.fen() }

describe('traps indexed by position, not move order (S15)', () => {
  it('indexes every position of every trap line with its ply', () => {
    const index = trapIndex([scholar, blackburne])
    const atE5 = index.get(positionHash(fenOf('e4 e5')))!
    expect(atE5.map((e) => [e.trap.id, e.ply]).sort()).toEqual([['b', 2], ['s', 2]])
    expect(index.get(positionHash(fenOf('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#')))!.map((e) => [e.trap.id, e.ply])).toEqual([['s', 7]])
  })

  it('finds a trap reached by another move order and proposes its next move for the side to move', () => {
    const fen = fenOf('Nf3 Nc6 e4 e5')
    expect(trapsAt(fen, [scholar, blackburne]).map((x) => [x.trap.id, x.ply])).toEqual([['b', 4]])
    const next = trapContinuations(fen, [scholar, blackburne])
    expect(next.map((n) => [n.san, n.from, n.to, n.kind, n.traps.map((t) => t.id)])).toEqual([['Bc4', 'f1', 'c4', 'line', ['b']]])
  })

  it('offers a legal move that leads into a position on a trap line (one-move lookahead)', () => {
    const fen = fenOf('Nf3 Nc6 e4')
    expect(trapsAt(fen, [scholar, blackburne])).toEqual([])
    const next = trapContinuations(fen, [scholar, blackburne])
    expect(next.map((n) => [n.san, n.kind, n.traps.map((t) => t.id)])).toEqual([['e5', 'transposition', ['b']]])
  })

  it('offers the move that completes a trap', () => {
    const next = trapContinuations(fenOf('e4 e5 Bc4 Nc6 Qh5 Nf6'), [scholar])
    expect(next.map((n) => [n.san, n.kind])).toEqual([['Qxf7#', 'line']])
  })

  it('gives nothing for a position off every line, and nothing for an invalid FEN', () => {
    expect(trapContinuations(fenOf('a4 h5'), [scholar, blackburne])).toEqual([])
    expect(trapContinuations('not a fen', [scholar])).toEqual([])
  })
})

describe('engine text of a training board (S17)', () => {
  it('writes the score from White and the best line as SAN, stopping at a move that does not fit', async () => {
    const { pvToSan, scoreText } = await import('./evalText')
    expect(scoreText({ scoreCp: 35 })).toBe('+0.35')
    expect(scoreText({ scoreCp: -120 })).toBe('-1.20')
    expect(scoreText({ mate: -2 })).toBe('-#2')
    expect(pvToSan(new Chess().fen(), ['e2e4', 'e7e5', 'a1a8'])).toEqual(['e4', 'e5'])
  })
})

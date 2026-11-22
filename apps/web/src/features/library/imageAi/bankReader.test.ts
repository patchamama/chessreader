import { describe, it, expect } from 'vitest'
import { addToBank, encodePatch, entriesFromDiagram, type BankEntry } from './squareBank'
import { boardOf, readWithBank } from './bankReader'
import { boardPatches, PATCH } from './templateReader'
import { drawBoard } from './syntheticBoard.testutil'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
const SMALL = '8/8/8/8/8/8/8/R7'
const learn = (board: string) => addToBank([], entriesFromDiagram(boardPatches(drawBoard(board)), `${board} w - - 0 1`))

describe('bankReader', () => {
  it('reads a diagram with no doubts when every square looks like one in the bank', () => {
    const other = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR'
    const reads = readWithBank(boardPatches(drawBoard(other)), learn(START))
    expect(boardOf(reads)).toBe(other)
    expect(reads.filter((r) => r.doubt)).toEqual([])
  })

  it('an empty bank is one big doubt', () => {
    const reads = readWithBank(boardPatches(drawBoard(START)), [])
    expect(reads).toHaveLength(64)
    expect(reads.every((r) => r.doubt && r.candidates.length === 0)).toBe(true)
  })

  it('a square that looks like nothing in the bank is a doubt, with the likely candidates first', () => {
    const reads = readWithBank(boardPatches(drawBoard('8/8/8/8/8/8/8/q6R')), learn('8/8/8/8/8/8/8/R6R'))
    const a1 = reads.find((r) => r.square === 'a1')!
    expect(a1.doubt).toBe(true)
    expect(a1.candidates.length).toBeGreaterThan(0)
    expect(reads.filter((r) => r.doubt).map((r) => r.square)).toEqual(['a1'])
  })

  it('two labels that look the same are a doubt even when the match is exact', () => {
    const same = encodePatch(new Float32Array(PATCH * PATCH).fill(0.9))
    const bank: BankEntry[] = [{ label: 'P', colour: 0, patch: same }, { label: 'p', colour: 0, patch: same }]
    const patches = Array.from({ length: 64 }, () => new Float32Array(PATCH * PATCH).fill(0.9))
    const read = readWithBank(patches, bank)[0]
    expect(read.doubt).toBe(true)
    expect(read.candidates.slice(0, 2).sort()).toEqual(['P', 'p'])
  })

  it('one answer is added to the bank and the re-reading resolves the square and its look-alikes', () => {
    const board = '8/8/8/8/8/8/8/q6q' // h1 is light, a1 is dark
    const patches = boardPatches(drawBoard(board))
    let bank = learn(SMALL)
    const before = readWithBank(patches, bank)
    const doubts = before.filter((r) => r.doubt)
    expect(doubts.length).toBeGreaterThan(0)
    // The user says what h1 is: the bank learns it and only the other colour stays in doubt.
    const h1 = before.find((r) => r.square === 'h1')!
    bank = addToBank(bank, [{ label: 'q', colour: 0, patch: encodePatch(patches[h1.index]) }])
    const after = readWithBank(patches, bank)
    expect(after.find((r) => r.square === 'h1')).toMatchObject({ label: 'q', doubt: false })
    expect(after.filter((r) => r.doubt).length).toBeLessThan(doubts.length)
  })
})

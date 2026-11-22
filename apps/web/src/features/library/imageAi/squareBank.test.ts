import { describe, it, expect, beforeEach } from 'vitest'
import { addToBank, decodePatch, encodePatch, entriesFromDiagram, exportBank, importBank, loadBank, saveBank, useSquareBank, type BankEntry } from './squareBank'
import { boardPatches, PATCH } from './templateReader'
import { drawBoard } from './syntheticBoard.testutil'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
const flat = (v: number) => new Float32Array(PATCH * PATCH).fill(v)
const entry = (label: string, v: number, colour: 0 | 1 = 0): BankEntry => ({ label, colour, patch: encodePatch(flat(v)) })

beforeEach(() => { localStorage.clear(); useSquareBank.setState({ banks: {} }) })

describe('squareBank', () => {
  it('encodes a patch to a string and back (to 1/255)', () => {
    const p = flat(0.5)
    p[3] = 1; p[4] = 0
    const back = decodePatch(encodePatch(p))
    expect(back).toHaveLength(PATCH * PATCH)
    expect(back[3]).toBeCloseTo(1, 2)
    expect(back[4]).toBeCloseTo(0, 2)
    expect(back[0]).toBeCloseTo(0.5, 2)
  })

  it('cuts a diagram with a known FEN into 64 labelled squares with their colour', () => {
    const entries = entriesFromDiagram(boardPatches(drawBoard(START)), `${START} w KQkq - 0 1`)
    expect(entries).toHaveLength(64)
    expect(entries[0]).toMatchObject({ label: 'r', colour: 0 }) // a8 is light
    expect(entries[1]).toMatchObject({ label: 'n', colour: 1 })
    expect(entries[63]).toMatchObject({ label: 'R', colour: 0 }) // h1 is light
    expect(entriesFromDiagram(boardPatches(drawBoard(START)), 'not a fen')).toEqual([])
  })

  it('adds entries, skipping near-identical ones of the same label and colour', () => {
    let bank = addToBank([], [entry('P', 0.5), entry('P', 0.5), entry('P', 0.9), entry('p', 0.5), entry('P', 0.5, 1)])
    expect(bank.map((e) => `${e.label}${e.colour}`)).toEqual(['P0', 'P0', 'p0', 'P1'])
    bank = addToBank(bank, [entry('P', 0.5)])
    expect(bank).toHaveLength(4)
  })

  it('evicts the oldest entries beyond the cap', () => {
    const bank = addToBank([], [entry('a', 0.1), entry('b', 0.3), entry('c', 0.5), entry('d', 0.7)], 3)
    expect(bank.map((e) => e.label)).toEqual(['b', 'c', 'd'])
  })

  it('persists per book and survives a broken storage', () => {
    saveBank('16', [entry('P', 0.4)])
    expect(loadBank('16')).toEqual([entry('P', 0.4)])
    expect(loadBank('17')).toEqual([])
    localStorage.setItem('chess-ebook.squareBank.18', '{not json')
    expect(loadBank('18')).toEqual([])
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('quota') }
    try { expect(saveBank('16', [entry('P', 0.4)])).toBe(false) } finally { Storage.prototype.setItem = original }
  })

  it('exports to JSON and imports it back; an invalid file is refused', () => {
    const bank = [entry('P', 0.4), entry('.', 0.8, 1)]
    expect(importBank(exportBank(bank))).toEqual(bank)
    expect(() => importBank('{"x":1}')).toThrow(/bank/i)
    expect(() => importBank('nope')).toThrow()
    expect(() => importBank(JSON.stringify({ format: 'chess-ebook-square-bank', version: 1, entries: [{ label: 'Z', colour: 0, patch: 'ab' }] }))).toThrow(/bank/i)
  })

  it('the store adds, persists and merges an imported bank', () => {
    useSquareBank.getState().add('16', [entry('P', 0.4)])
    expect(useSquareBank.getState().banks['16']).toHaveLength(1)
    expect(loadBank('16')).toHaveLength(1)
    useSquareBank.getState().merge('16', [entry('n', 0.2), entry('P', 0.4)])
    expect(useSquareBank.getState().banks['16'].map((e) => e.label)).toEqual(['P', 'n'])
  })
})

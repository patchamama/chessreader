import { describe, it, expect } from 'vitest'
import type { WrongMoveFix } from '@chess-ebook/chess-shared'
import { applyFix, fixLabel, parseRank, previewFix, rankPrompt } from './wrongMove'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const fix = (f: Partial<WrongMoveFix>): WrongMoveFix => ({ ply: 0, kind: 'substitute', from: '', to: '', playedAfter: 0, complete: false, ...f })
const PRINTED = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb4', 'a6', 'Ba4']

describe('applyFix', () => {
  it('substitutes, deletes, inserts before and swaps', () => {
    expect(applyFix(PRINTED, fix({ ply: 4, kind: 'substitute', from: 'Bb4', to: 'Bb5' }))[4]).toBe('Bb5')
    expect(applyFix(['e4', 'e4', 'e5'], fix({ ply: 1, kind: 'delete', from: 'e4' }))).toEqual(['e4', 'e5'])
    expect(applyFix(['e4', 'Nf3'], fix({ ply: 1, kind: 'insert', to: 'e5' }))).toEqual(['e4', 'e5', 'Nf3'])
    expect(applyFix(['Nf3', 'e4', 'e5'], fix({ ply: 0, kind: 'swap', from: 'Nf3 e4', to: 'e4 Nf3' }))).toEqual(['e4', 'Nf3', 'e5'])
  })
})

describe('previewFix', () => {
  it('counts the moves read after the fix', () => {
    expect(previewFix(PRINTED, fix({ ply: 4, kind: 'substitute', from: 'Bb4', to: 'Bb5' }), START)).toEqual({ read: 7, total: 7 })
  })
})

describe('fixLabel', () => {
  it('numbers the move and names the kind', () => {
    expect(fixLabel(fix({ ply: 4, kind: 'substitute', from: 'Bb4', to: 'Bb5' }))).toBe('3. Bb4 → Bb5 (substitute)')
    expect(fixLabel(fix({ ply: 5, kind: 'insert', to: 'a6' }))).toBe('3... + a6 (insert)')
    expect(fixLabel(fix({ ply: 5, kind: 'delete', from: 'Ba4' }))).toBe('3... − Ba4 (delete)')
  })
})

describe('rankPrompt / parseRank', () => {
  it('sends the printed moves around the failing ply and the numbered fixes', () => {
    const moves = Array.from({ length: 20 }, (_, i) => ({ written: `m${i}` }))
    const prompt = rankPrompt({ moves, failingPly: 10, excerpt: 'printed text', fixes: [fix({ ply: 10, from: 'm10', to: 'x' })] })
    expect(prompt).toContain('printed text')
    expect(prompt).toContain('m4')
    expect(prompt).toContain('m16')
    expect(prompt).not.toContain('m3 ')
    expect(prompt).not.toContain('m17')
    expect(prompt).toContain('1. 6. m10 → x (substitute)')
  })

  it('reads {best, reason} (1-based) and refuses an out-of-range pick', () => {
    expect(parseRank('Sure: {"best": 2, "reason": "fits"}', 3)).toEqual({ best: 1, reason: 'fits' })
    expect(parseRank('{"best": 4, "reason": "x"}', 3)).toBeNull()
    expect(parseRank('no json', 3)).toBeNull()
  })
})

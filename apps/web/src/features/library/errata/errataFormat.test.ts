import { describe, it, expect } from 'vitest'
import { bookSlug, buildErrataEntry, errataPath, validateErrata } from './errataFormat'
import { SAMPLE } from './errataFixture'


describe('bookSlug', () => {
  it('is the same slug the server computes (accents transliterated, no dots or slashes)', () => {
    expect(bookSlug('Mis geniales predecesores. Volumen I')).toBe('mis-geniales-predecesores-volumen-i')
    expect(bookSlug('Schach Straße Über alles')).toBe('schach-strasse-uber-alles')
    expect(bookSlug('../../etc/passwd')).toBe('etc-passwd')
    expect(bookSlug('a'.repeat(200))).toHaveLength(80)
  })
})

describe('errataPath', () => {
  it('is <book-slug>/<chapter>-<gameIndex>.json', () => {
    expect(errataPath(SAMPLE)).toBe('smith-games/2-0.json')
  })
})

describe('validateErrata', () => {
  it('accepts a complete entry', () => {
    expect(validateErrata(SAMPLE)).toEqual([])
  })
  it('reports what is wrong', () => {
    const bad = { ...SAMPLE, chapter: -1, changes: [{ ply: 0, from: 'a', to: 'b', source: 'guess' }] }
    expect(validateErrata(bad)).toEqual(expect.arrayContaining([
      'chapter must be an integer >= 0',
      'changes[0].ply must be an integer >= 1',
      'changes[0].source must be one of online, engine, manual',
    ]))
    expect(validateErrata(null)).toContain('the entry must be an object')
  })
})

describe('buildErrataEntry', () => {
  it('lists only the substituted moves, with their source and evidence', () => {
    const entry = buildErrataEntry({
      book: { title: 'Smith Games', id: 7 },
      chapter: 2,
      gameIndex: 0,
      game: { label: 'Smith – Jones', white: 'Smith', black: 'Jones' },
      original: [
        { written: 'e4', san: 'e4' }, { written: 'e5', san: 'e5' }, { written: 'Bb4!?', san: 'Bb4' }, { written: 'Rg7', san: 'Kg7' },
      ],
      corrected: [
        { san: 'e4' }, { san: 'e5' }, { san: 'Bb5', origin: 'online', evidence: 'https://lichess.org/x' }, { san: 'Kg7' },
      ],
      text: '1. e4 e5 2. Bb4!? Rg7',
      now: new Date('2026-11-18T10:00:00Z'),
      appVersion: '0.106.6',
    })
    expect(entry.changes).toEqual([{ ply: 3, from: 'Bb4!?', to: 'Bb5', source: 'online', evidence: 'https://lichess.org/x' }])
    expect(entry.original.moves).toEqual(['e4', 'e5', 'Bb4!?', 'Rg7'])
    expect(entry.corrected.moves).toEqual(['e4', 'e5', 'Bb5', 'Kg7'])
    expect(entry.id).toBe('smith-games-2-0')
    expect(entry.createdAt).toBe('2026-11-18T10:00:00.000Z')
    expect(validateErrata(entry)).toEqual([])
  })
  it('a move changed by hand without a source is manual', () => {
    const entry = buildErrataEntry({
      book: { title: 'B' }, chapter: 1, gameIndex: 0, game: { label: 'G' },
      original: [{ written: 'e3', san: 'e3' }], corrected: [{ san: 'e4' }], text: '1. e3',
    })
    expect(entry.changes[0].source).toBe('manual')
  })
})

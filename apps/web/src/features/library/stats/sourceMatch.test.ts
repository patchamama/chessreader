import { describe, it, expect } from 'vitest'
import { matchSource } from './sourceMatch'

const src = (id: number, title: string, book: string | null = null) => ({ id, title, author: null, kind: 'book', lang: 'es', book })
const SOURCES = [
  src(1, 'Mis geniales predecesores I'), src(2, 'Mis geniales predecesores II'), src(3, 'Mis geniales predecesores III'),
  src(7, 'Mi sistema'), src(8, 'My System & Chess Praxis'),
  src(11, 'El mejor de todos los tiempos 1961–2000'), src(12, 'El mejor de todos los tiempos 1'),
  { ...src(18, 'Lichess annotated studies'), kind: 'lichess' },
]

describe('matchSource: the database source of a library book', () => {
  it('matches a source whose title starts the library title', () => {
    expect(matchSource(SOURCES, 'Mis geniales predecesores I. De Steinitz a Alekhine')?.id).toBe(1)
    expect(matchSource(SOURCES, 'Mis geniales predecesores II. De Euwe A Tal')?.id).toBe(2)
    expect(matchSource(SOURCES, 'Mis geniales predecesores III. De Petrosian A Spassky')?.id).toBe(3)
  })
  it('does not take "I" for the start of "II" (whole words only)', () => {
    expect(matchSource(SOURCES.slice(0, 1), 'Mis geniales predecesores II. De Euwe A Tal')).toBeNull()
  })
  it('ignores case, accents and punctuation', () => {
    expect(matchSource(SOURCES, '¡MI  sistema!')?.id).toBe(7)
    expect(matchSource([src(9, '¡Al ataque!')], 'Al ataque')?.id).toBe(9)
  })
  it('prefers the longest title, and the source that records the book id', () => {
    expect(matchSource(SOURCES, 'El mejor de todos los tiempos 1961 – 2000: Una historia')?.id).toBe(11)
    expect(matchSource([src(5, 'Other', '6'), src(6, 'Another')], 'Something else', 6)?.id).toBe(5)
  })
  it('never picks a Lichess source, and finds nothing when nothing is alike', () => {
    expect(matchSource(SOURCES, 'Lichess annotated studies')).toBeNull()
    expect(matchSource(SOURCES, 'A book the database does not know')).toBeNull()
  })
})

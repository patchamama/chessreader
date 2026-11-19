import { describe, expect, it } from 'vitest'
import { appendNote } from './tutorLog'

describe('tutor log: a repeated consecutive comment is not repeated (S14.5)', () => {
  it('counts the repetition on the existing line instead of adding a new one', () => {
    let log = appendNote([], { ply: 1, who: 'tutor', text: 'Chance: Nd5.' })
    log = appendNote(log, { ply: 3, who: 'tutor', text: 'Chance: Nd5.' })
    log = appendNote(log, { ply: 5, who: 'tutor', text: 'Chance: Nd5.' })
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ text: 'Chance: Nd5.', count: 3, ply: 5 })
  })
  it('a different comment in between, or another speaker, starts a new line', () => {
    let log = appendNote([], { ply: 1, who: 'tutor', text: 'A' })
    log = appendNote(log, { ply: 2, who: 'opponent', text: 'A' })
    log = appendNote(log, { ply: 3, who: 'tutor', text: 'B' })
    log = appendNote(log, { ply: 4, who: 'tutor', text: 'A' })
    expect(log.map((n) => [n.who, n.text, n.count ?? 1])).toEqual([['tutor', 'A', 1], ['opponent', 'A', 1], ['tutor', 'B', 1], ['tutor', 'A', 1]])
  })
})

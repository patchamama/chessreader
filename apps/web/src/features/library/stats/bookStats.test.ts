import { describe, it, expect } from 'vitest'
import { chapterStats, addStats, EMPTY_STATS } from './bookStats'

describe('chapterStats', () => {
  it('counts games, main-line plies, variations, book remarks and errors of a chapter', () => {
    const html = [
      '<p>Intro.</p>',
      '<p>1. e4 e5 2. Nf3 (2. f4 exf4 3. Nf3) Nc6 3. Bb5</p>',
      '<blockquote class="human-comment"><p>A remark.</p></blockquote>',
      '<blockquote class="human-comment"><p>Another.</p></blockquote>',
    ].join('\n')
    const s = chapterStats(html)
    expect(s.games).toBe(1)
    expect(s.plies).toBe(5)
    expect(s.variations).toBe(1)
    expect(s.comments).toBe(2)
    expect(s.errors).toBe(0)
  })

  it('is all zeros for a chapter without games', () => {
    expect(chapterStats('<p>Only prose here.</p>')).toEqual(EMPTY_STATS)
  })
})

describe('addStats', () => {
  it('adds two partial results', () => {
    expect(addStats({ games: 1, plies: 2, variations: 3, comments: 4, errors: 5 }, { games: 1, plies: 1, variations: 1, comments: 1, errors: 1 }))
      .toEqual({ games: 2, plies: 3, variations: 4, comments: 5, errors: 6 })
  })
})

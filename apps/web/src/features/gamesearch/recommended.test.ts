import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { RECOMMENDED_GAMES, openingsFor, lichessStudySearchUrl } from './recommended'
import { pgnToChapters } from './pgnChapters'
import { htmlToProseText } from '../library/utils/proseText'
import { studyIdFrom, rankMasters } from './sources'

describe('recommended games', () => {
  it.each(RECOMMENDED_GAMES.map((g) => [g.id, g] as const))('%s is a complete, legal, annotated game the reader recognises', (_id, g) => {
    const { chapters } = pgnToChapters(g.pgn)
    expect(chapters).toHaveLength(1)
    const [game] = recognizeGames(htmlToProseText(chapters[0].html), { algorithm: 2 })
    expect(game.tree.errors).toEqual([])
    expect(game.tree.mainline).toHaveLength(g.plies)
    const last = game.tree.nodes.get(game.tree.mainline[game.tree.mainline.length - 1])!
    expect(new Chess(last.fen).isCheckmate()).toBe(g.mate)
    expect(g.pgn).toContain('{')
  })

  it('has games for every category and openings for every level', () => {
    expect(new Set(RECOMMENDED_GAMES.map((g) => g.category))).toEqual(new Set(['mates', 'traps', 'classics']))
    expect(openingsFor('beginner').map((o) => o.id)).toContain('italian')
    expect(openingsFor('advanced').length).toBeGreaterThan(2)
    expect(lichessStudySearchUrl('My System Nimzowitsch')).toBe('https://lichess.org/study/search?q=My%20System%20Nimzowitsch')
  })
})

describe('search helpers', () => {
  it('reads a study id from a Lichess link or a bare id', () => {
    expect(studyIdFrom('https://lichess.org/study/LF4x850G')).toBe('LF4x850G')
    expect(studyIdFrom('https://lichess.org/study/LF4x850G/abcdEFGH')).toBe('LF4x850G')
    expect(studyIdFrom(' LF4x850G ')).toBe('LF4x850G')
    expect(studyIdFrom('not a study')).toBeNull()
  })
  it('ranks master games by the average rating of the players', () => {
    const g = (id: string, w: number, b: number) => ({ id, white: 'A', black: 'B', year: 2000, result: '1-0', whiteRating: w, blackRating: b })
    expect(rankMasters([g('a', 2500, 2500), g('b', 2800, 2700), g('c', 2600, 2650)]).map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
})

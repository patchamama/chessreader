import { describe, it, expect } from 'vitest'
import { recognizeGames, tokenize, figurineToAscii } from '@chess-ebook/chess-shared'
import { DEMO_BOOKS } from './demoGames'
import { htmlToProseText, planMoveTargets } from '../features/library/utils/proseText'

describe('demo library: complete annotated games', () => {
  for (const { book, chapters } of DEMO_BOOKS) {
    for (const chapter of chapters) {
      const text = htmlToProseText(chapter.html)

      for (const algorithm of chapter.misprints ? ([1, 2] as const) : ([1, 2, 3] as const)) {
        it(`${book.title} / ${chapter.title}: algorithm ${algorithm} reads the whole game`, () => {
          const games = recognizeGames(text, { algorithm })
          expect(games).toHaveLength(1)
          expect(games[0].tree.mainline).toHaveLength(chapter.plies)
        })
      }

      it(`${book.title} / ${chapter.title}: every written move is legal and painted (algorithm 2)`, () => {
        const [game] = recognizeGames(text, { algorithm: 2 })
        // Only the misprints planted on purpose are reported, each with its fix.
        expect(game.tree.errors.map((e) => [e.kind, e.san, e.suggestion])).toEqual(
          (chapter.misprints ?? []).map(([written, fix]) => ['wrong-move', written, fix]),
        )
        const written = tokenize(figurineToAscii(text)).filter((t) => t.type === 'move' && !t.isolated)
        const valid = [...game.tree.nodes.values()].filter((n) => n.fen && !n.invalid)
        expect(valid).toHaveLength(written.length)
        const painted = planMoveTargets(text, [game]).filter((t) => t.kind === 'node')
        expect(painted).toHaveLength(valid.length)
      })

      it(`${book.title} / ${chapter.title}: the game ends in checkmate`, () => {
        const [game] = recognizeGames(text, { algorithm: 2 })
        const last = game.tree.nodes.get(game.tree.mainline[game.tree.mainline.length - 1])!
        expect(last.san.endsWith('#')).toBe(true)
      })
    }
  }
})

import { describe, it, expect } from 'vitest'
import { recognizeGames, DIAGRAM_MARK } from '../../recognition/recognizeGames.js'
import type { GameTree } from '../../model/gameTree.js'

const mainSans = (tree: GameTree) => tree.mainline.map((id) => tree.nodes.get(id)!.san)
const allSans = (tree: GameTree) => [...tree.nodes.values()].map((n) => n.san)

const GAME_A = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6'
const GAME_B = '1. d4 d5 2. c4 e6 3. Nc3 Nf6'

describe('several games in one text restart the board', () => {
  for (const algorithm of [1, 2, 3] as const) {
    it(`algorithm ${algorithm}: a paragraph that opens with "1." starts a new game from the initial position`, () => {
      const games = recognizeGames(`${GAME_A}\nWhite stands better.\n${GAME_B}`, { algorithm })
      expect(games.map((g) => mainSans(g.tree))).toEqual([
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'],
        ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'],
      ])
    })

    it(`algorithm ${algorithm}: an unclosed bracket in the first game does not swallow the second`, () => {
      const games = recognizeGames(`${GAME_A} (a comment that never closes\n${GAME_B}`, { algorithm })
      expect(games).toHaveLength(2)
      expect(mainSans(games[1].tree)).toEqual(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'])
    })

    it(`algorithm ${algorithm}: three games in a row`, () => {
      const games = recognizeGames(`${GAME_A}\n${GAME_B}\n1. c4 e5 2. Nc3`, { algorithm })
      expect(games.map((g) => g.tree.mainline.length)).toEqual([8, 6, 3])
    })
  }
})

describe('a fragment that starts at a later move after a diagram', () => {
  // After the diagram the text jumps to move 23 of ANOTHER game: those moves
  // must not be played on (or hung from) the game that precedes the diagram.
  const TEXT = [
    GAME_A,
    'A similar idea was seen in a famous game.',
    DIAGRAM_MARK,
    '23. Rxe5 Qxe5 24. Bb2',
    'and White won.',
  ].join('\n')

  for (const algorithm of [1, 2, 3] as const) {
    it(`algorithm ${algorithm}: the fragment is not attached to the previous game`, () => {
      const games = recognizeGames(TEXT, { algorithm })
      expect(games).toHaveLength(1)
      expect(mainSans(games[0].tree)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'])
      expect(allSans(games[0].tree)).not.toContain('Rxe5')
      expect(games[0].tree.errors).toEqual([])
      expect(games[0].tree.isolatedMoves.map((m) => m.san)).not.toContain('Rxe5')
    })

    it(`algorithm ${algorithm}: the game resumes after the fragment`, () => {
      const games = recognizeGames(`${TEXT}\n5. O-O Be7 6. Re1`, { algorithm })
      expect(games).toHaveLength(1)
      expect(mainSans(games[0].tree).slice(-3)).toEqual(['O-O', 'Be7', 'Re1'])
    })

    it(`algorithm ${algorithm}: a diagram followed by the NEXT move just continues the game`, () => {
      const games = recognizeGames(`${GAME_A}\n${DIAGRAM_MARK}\n5. O-O Be7`, { algorithm })
      expect(mainSans(games[0].tree).slice(-2)).toEqual(['O-O', 'Be7'])
    })

    // Algorithm 3 (legacy) re-anchors its mainline on a paragraph that restates
    // an earlier ply, with or without a diagram; only 1 and 2 are pinned here.
    it.skipIf(algorithm === 3)(`algorithm ${algorithm}: a diagram followed by an EARLIER move is analysis of the same game`, () => {
      const games = recognizeGames(`${GAME_A}\n${DIAGRAM_MARK}\n3... Nf6 4. O-O\n5. O-O Be7`, { algorithm })
      expect(games).toHaveLength(1)
      expect(mainSans(games[0].tree).slice(-2)).toEqual(['O-O', 'Be7'])
    })

    it(`algorithm ${algorithm}: a new game after the fragment starts from the initial position`, () => {
      const games = recognizeGames(`${TEXT}\n${GAME_B}`, { algorithm })
      expect(games).toHaveLength(2)
      expect(mainSans(games[1].tree)).toEqual(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'])
    })
  }
})

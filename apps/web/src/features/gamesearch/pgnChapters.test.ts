import { describe, it, expect } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { pgnToChapters } from './pgnChapters'
import { htmlToProseText } from '../library/utils/proseText'

const PGN = `[Event "Study: Chapter 1"]
[White "Morphy, Paul"]
[Black "Duke & Count"]
[Date "1858.??.??"]
[ChapterName "The Opera Game"]

1. e4 { [%eval 0.18] [%clk 0:10:00] } 1... e5 2. Nf3 d6 { The Philidor <Defence>. } 3. d4 Bg4 $6 (3... exd4 4. Nxd4) 4. dxe5 1-0

[Event "Puzzle"]
[White "A"]
[Black "B"]
[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]
[SetUp "1"]

1. Kb1 *

[Event "Casual"]
[White "Légal"]
[Black "Saint Brie"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0
`

describe('pgnToChapters', () => {
  const { chapters, skipped } = pgnToChapters(PGN)

  it('makes one chapter per game from the standard start position', () => {
    expect(chapters.map((c) => c.title)).toEqual(['The Opera Game', 'Légal — Saint Brie'])
    expect(skipped).toBe(1)
    expect(chapters[0].toc).toEqual([
      { order: 1, title: 'The Opera Game' },
      { order: 2, title: 'Légal — Saint Brie' },
    ])
  })

  it('drops engine/clock tags, keeps comments and escapes markup', () => {
    const html = chapters[0].html
    expect(html).not.toContain('%eval')
    expect(html).not.toContain('{  }')
    expect(html).toContain('{ The Philidor &lt;Defence&gt;. }')
    expect(html).toContain('Morphy, Paul — Duke &amp; Count')
  })

  it('the chapter reads as one game with its variation', () => {
    const text = htmlToProseText(chapters[0].html)
    const games = recognizeGames(text, { algorithm: 2 })
    expect(games).toHaveLength(1)
    const tree = games[0].tree
    expect(tree.mainline.map((id) => tree.nodes.get(id)!.san)).toEqual(['e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5'])
    expect(tree.nodes.size).toBe(9)
    const legal = recognizeGames(htmlToProseText(chapters[1].html), { algorithm: 2 })[0].tree
    expect(legal.mainline).toHaveLength(13)
  })
})

describe('games that start from a position (book fragments with a FEN)', () => {
  it('are opened from that position: the FEN line comes before the moves', async () => {
    const { recognizeGames } = await import('@chess-ebook/chess-shared')
    const { htmlToProseText } = await import('../library/utils/proseText')
    const fen = '5rk1/1pp5/r5bp/p1nPp1q1/2P2p2/2N5/PP1QBRPP/5R1K w - - 0 26'
    const { chapters, skipped } = pgnToChapters(`[White "Petrosian"]\n[Black "Gligoric"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n26. g3 Ne4 27. Nxe4 Bxe4+ *`, { fromPosition: true })
    expect(skipped).toBe(0)
    const [g] = recognizeGames(htmlToProseText(chapters[0].html), { algorithm: 2 })
    expect(g.tree.startFen).toBe(fen)
    expect(g.tree.mainline.map((id) => g.tree.nodes.get(id)!.san)).toEqual(['g3', 'Ne4', 'Nxe4', 'Bxe4+'])
  })
})

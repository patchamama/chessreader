import { describe, it, expect } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { extractProseText, htmlToProseText, planMoveTargets, piecesByTextNode } from './proseText'

const BYRNE_HTML = [
  '<p>1. ♘f3 ♘f6 2. c4 g6 3. ♘c3 ♗g7 4. d4 O-O 5. ♗f4 d5</p>',
  '<p>6. ♕b3 6... dxc4 7. ♕xc4 c6 8. e4 ♘bd7 9. ♖d1</p>',
  '<p>Si 9. e5 ♘d5! 10. ♘xd5 ♘xd5 11. ♕b3 (11. ♕xd5? ♘xe5!), 11... ♘b6.</p>',
  '<p>9... ♘b6 10. ♕c5</p>',
  '<p>1. e4 c5 2. ♘f3 d6 3. d4 cxd4 4. ♘xd4 ♘f6 5. ♘c3 a6 6. ♗g5 e6 7. f4 ♗e7 8. ♕f3 ♕c7</p>',
  '<p>9. e5 dxe5 10. fxe5 ♘fd7</p>',
].join('\n')

function dom(html: string): HTMLElement {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('extractProseText', () => {
  it('turns blocks into newlines, collapses whitespace and joins inline tags', () => {
    const { text } = extractProseText(dom('<p>1.  <b>♘</b>f3\n  ♘f6</p><p>2. c4</p>'))
    expect(text).toBe('1. ♘f3 ♘f6\n2. c4')
  })

  it('maps every non-synthetic character back to its DOM text node', () => {
    const root = dom('<p>1. <b>♘</b>f3</p>')
    const { text, map } = extractProseText(root)
    text.split('').forEach((ch, i) => {
      const pos = map[i]
      if (pos) expect(pos.node.nodeValue![pos.offset]).toBe(ch)
    })
  })

  it('htmlToProseText (parsed string) equals the extraction of the rendered DOM', () => {
    expect(htmlToProseText(BYRNE_HTML)).toBe(extractProseText(dom(BYRNE_HTML)).text)
  })
})

for (const algorithm of [1, 2, 3] as const) {
  describe(`planMoveTargets (algorithm ${algorithm})`, () => {
    const text = htmlToProseText(BYRNE_HTML)
    const games = recognizeGames(text, { algorithm })
    const targets = planMoveTargets(text, games)

    it('every node target covers exactly its source token text', () => {
      for (const t of targets) {
        if (t.kind !== 'node') continue
        const slice = text.slice(t.start, t.end)
        expect(slice.endsWith(t.node.rawSan ?? t.node.san)).toBe(true)
      }
    })

    it('a written move number always equals the node move number', () => {
      for (const t of targets) {
        if (t.kind !== 'node') continue
        const m = /^(\d+)(\.\.\.|\.)/.exec(text.slice(t.start, t.end))
        if (!m) continue
        expect(Number(m[1])).toBe(t.node.moveNumber)
        expect(m[2] === '...' ? 'black' : 'white').toBe(t.node.color)
      }
    })

    it('the second game "9. e5" is painted by game 1, never by the prose of game 0', () => {
      const lastE5 = text.lastIndexOf('9. e5')
      const proseE5 = text.indexOf('Si 9. e5') + 3
      const atLast = targets.find((t) => t.start === lastE5)
      expect(atLast?.kind).toBe('node')
      expect(atLast?.gameIndex).toBe(1)
      const atProse = targets.find((t) => t.start === proseE5)
      if (atProse) expect(atProse.gameIndex).toBe(0)
      if (algorithm === 1) expect(atProse).toBeUndefined()
    })
  })
}

describe('piecesByTextNode', () => {
  it('splits a token crossing an inline tag into one piece per text node', () => {
    const root = dom('<p>1. <b>♘</b>f3 ♘f6</p>')
    const { text, map } = extractProseText(root)
    const pieces = piecesByTextNode(map, [{ start: 0, end: text.indexOf(' ♘f6') }])
    const texts = [...pieces.entries()].flatMap(([n, l]) => l.map((p) => n.nodeValue!.slice(p.start, p.end)))
    // The space before the inline tag stays outside (collapsed whitespace).
    expect(texts).toEqual(['1.', '♘', 'f3'])
  })
})

describe('demo chapters: every valid node is painted at its own source token', async () => {
  const { MOCK_CHAPTERS } = await import('../../../demo/mockData')
  for (const [id, chapter] of Object.entries(MOCK_CHAPTERS)) {
    for (const algorithm of [1, 2] as const) {
      it(`book ${id}, algorithm ${algorithm}`, () => {
        const text = htmlToProseText(chapter.html)
        const games = recognizeGames(text, { algorithm })
        const targets = planMoveTargets(text, games).filter((t) => t.kind === 'node')
        const valid = games.reduce(
          (n, g) => n + [...g.tree.nodes.values()].filter((x) => x.fen && !x.invalid).length,
          0,
        )
        expect(games.length).toBeGreaterThan(0)
        expect(targets).toHaveLength(valid)
        for (const t of targets) {
          if (t.kind !== 'node') continue
          expect(text.slice(t.start, t.end).endsWith(t.node.rawSan ?? t.node.san)).toBe(true)
        }
      })
    }
  }
})

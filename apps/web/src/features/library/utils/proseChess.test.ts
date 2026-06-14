import { describe, it, expect } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { successorOf, hasAlternativesAhead } from './proseChess'

const ANDERSSEN =
  '1. e4 e5 2. ♘f3 ♘c6 3. ♗c4 ♗c5 4. b4 ♗xb4 5. c3 ♗a5 6. d4 exd4 7. O-O d3 ' +
  '8. ♕b3 ♕f6 9. e5 ♕g6 10. ♖e1 ♘ge7 11. ♗a3 b5 12. ♕xb5 ♖b8 13. ♕a4 ♗b6 ' +
  '14. ♘bd2 ♗b7 15. ♘e4 ♕f5 16. ♗xd3 ♕h5 17. ♘f6+ gxf6 18. exf6 ♖g8 ' +
  '19. ♖ad1!! ♕xf3 20. ♖xe7+ ♘xe7 21. ♕xd7+! ♔xd7 22. ♗f5+ ♔e8 23. ♗d7+ ♔f8 24. ♗xe7# 1-0 ' +
  '19... ♖g4 fuerte. con 20... ♔d8. sería 21. ♖xd7+ ♔c8 22. ♖d8+ ♔xd8 ' +
  '(22... ♘xd8 23. ♕d7+!); 23. ♗f5+ (23. ♗e2+ ♘d4!) ♕xd1+ 24. ♕xd1+ ♘d4 25. ♗h3 ♗d5.'

const tree = () => recognizeGames(ANDERSSEN)[0].tree

function nodeBySan(t: ReturnType<typeof tree>, san: string) {
  return [...t.nodes.values()].find((n) => n.san === san && !n.invalid)!
}

describe('successorOf', () => {
  it('returns the next mainline node', () => {
    const t = tree()
    const e4 = nodeBySan(t, 'e4')
    const succ = successorOf(t, e4)
    expect(succ && t.nodes.get(succ)!.san).toBe('e5')
  })

  it('returns the next node inside a variation line', () => {
    const t = tree()
    // Rd8+ lives inside the long analysis variation line; successor is Kxd8.
    const rd8 = nodeBySan(t, 'Rd8+')
    const succ = successorOf(t, rd8)
    expect(succ && t.nodes.get(succ)!.san).toBe('Kxd8')
  })
})

describe('hasAlternativesAhead', () => {
  it('is true for a move whose successor has variations (Rd8+ → Kxd8/Nxd8)', () => {
    const t = tree()
    expect(hasAlternativesAhead(t, nodeBySan(t, 'Rd8+'))).toBe(true)
  })

  it('is true for Kxd8 (successor Bf5+ has the Be2+ alternative)', () => {
    const t = tree()
    expect(hasAlternativesAhead(t, nodeBySan(t, 'Kxd8'))).toBe(true)
  })

  it('is false for a plain move with no fork ahead', () => {
    const t = tree()
    expect(hasAlternativesAhead(t, nodeBySan(t, 'e4'))).toBe(false)
  })

  it('is false for the last move of a line', () => {
    const t = tree()
    expect(hasAlternativesAhead(t, nodeBySan(t, 'Bd5'))).toBe(false)
  })
})

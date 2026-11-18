import { describe, expect, it } from 'vitest'
import { lichessThemes, playIdeas } from './playIdeas'

describe('ideas while playing (S3)', () => {
  it('names the opening, the targets of the opponent and the chances of the side to move', () => {
    // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4?: the e5 pawn is attacked; White to move.
    const fen = 'r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
    const ideas = playIdeas(fen, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4'], 'white', 'en')
    expect(ideas.opening).toMatch(/Italian|King's Pawn|Blackburne/i)
    expect(ideas.targets.map((t) => t.square)).toContain('e5')
    expect(ideas.targets.find((t) => t.square === 'e5')!.why).toMatch(/pawn/)
  })

  it('names the tactical pattern of a move with the Lichess theme names (S4)', () => {
    // A knight fork: Nc7+ against king and rook.
    expect(lichessThemes('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Nc7+')).toContain('Fork')
  })
})

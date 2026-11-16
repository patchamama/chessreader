import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { recognizeGames, positionIdeas } from '@chess-ebook/chess-shared'
import { PositionIdeasPanel, ideasToCues } from './PositionIdeasPanel'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { useNarrationStore } from '../narration/narrationStore'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

// After 3...Nf6 the knight on g5 is not there yet; after 4. Ng5 d5 5. exd5 Nxd5 the knight on d5 is pinned-ish; keep it simple:
const [game] = recognizeGames('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. Nxe5', { algorithm: 2 })

beforeEach(() => {
  useStudyBoardStore.getState().reset()
  useNarrationStore.setState({ cues: [], status: 'idle' })
  useSettingsStore.setState({ language: 'en' })
})

describe('PositionIdeasPanel', () => {
  it('lists what stands out in the position on the board and lights it on request', () => {
    useStudyBoardStore.getState().loadPosition(game.tree, game.tree.mainline[8], false) // after 5. Nxe5
    render(<PositionIdeasPanel />)
    // The knight on e5 has taken a pawn and nothing defends it — but nothing attacks it either.
    expect(screen.getByTestId('ideas-loose')).toHaveTextContent('♘e5')
    expect(useNarrationStore.getState().cues).toEqual([])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Light them on the board' }))
    const squares = useNarrationStore.getState().cues.flatMap((c) => c.squares)
    expect(squares).toContainEqual({ square: 'e5', role: 'dubious' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Light them on the board' }))
    expect(useNarrationStore.getState().cues).toEqual([])
  })

  it('a piece that can be taken blinks, with an arrow from its attacker', () => {
    const cues = ideasToCues(positionIdeas('r3k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1'))
    const hanging = cues.find((c) => c.label === 'hanging')!
    expect(hanging.squares).toEqual([{ square: 'e5', role: 'bad', blink: true }])
    expect(hanging.arrows).toEqual([{ from: 'd6', to: 'e5', role: 'attacker' }])
  })
})

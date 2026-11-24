import { beforeEach, describe, expect, it } from 'vitest'
import { actionCues, recognizeGames } from '@chess-ebook/chess-shared'
import { endGuidePreview, locatePosition, previewGuideAction } from './guidePreview'
import { chipAction, renderGuideChips } from './guideChips'
import { useNarrationStore } from './narrationStore'
import { useStudyBoardStore } from '../store/studyBoardStore'

const TEXT = ['La partida de la Ópera', '1. e4 e5 2. ♘f3 d6', 'La Defensa Philidor. Las negras sostienen el peón de e5.', '3. d4 ♗g4'].join('\n')
const games = recognizeGames(TEXT, { algorithm: 2 })
const tree = games[0].tree
const after = tree.mainline[3]
const fen = tree.nodes.get(after)!.fen

function chipFor(actions: string, index = 0) {
  const root = document.createElement('div')
  root.innerHTML = '<p>La Defensa Philidor. Las negras sostienen el peón de e5.</p>'
  const p = root.querySelector('p')!
  renderGuideChips(root, [{ anchor: p, textElement: p, actions, fen }])
  return chipAction(root.querySelectorAll('.guide-chip')[index])!
}

beforeEach(() => {
  useStudyBoardStore.getState().reset()
  useNarrationStore.getState().stop()
  useNarrationStore.setState({ cues: [] })
})

describe('previewing one action on the board (ai-narration-guides S2)', () => {
  it('finds the position of the paragraph in the games', () => {
    expect(locatePosition(games, fen)).toEqual({ tree, nodeId: after })
    expect(locatePosition(games, tree.startFen)).toEqual({ tree, nodeId: null })
    expect(locatePosition(games, '8/8/8/8/8/8/8/K6k w - - 0 1')).toBeNull()
  })

  it('shows the position and exactly the cues the narrator would draw for that action', () => {
    const hit = chipFor('0Square:e5, 5Arrow:f1-b5', 1)
    previewGuideAction(hit, games)
    expect(useStudyBoardStore.getState().currentNodeId).toBe(after)
    expect(useNarrationStore.getState().cues).toEqual(actionCues(hit.action))
    endGuidePreview()
    expect(useNarrationStore.getState().cues).toEqual([])
  })

  it('leaves the board alone while the narrator is running', () => {
    useNarrationStore.setState({ status: 'playing' })
    previewGuideAction(chipFor('0Square:e5'), games)
    expect(useNarrationStore.getState().cues).toEqual([])
    useNarrationStore.setState({ status: 'idle' })
  })
})

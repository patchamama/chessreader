import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { NarrationPanel } from './NarrationPanel'
import { useNarrationStore, setNarrationRuntime } from './narrationStore'
import { useStudyBoardStore } from '../store/studyBoardStore'
import { cuesToBoard, CUE_COLORS, isCueArrow } from './cueStyles'

const TEXT = [
  '1. e4 e5 2. ♘f3 d6',
  'Las negras sostienen el peón de e5. Una clavada llegará pronto.',
  '3. d4',
].join('\n')
const games = recognizeGames(TEXT, { algorithm: 2 })

beforeEach(() => {
  useStudyBoardStore.getState().reset()
  setNarrationRuntime({ speaker: { speak: async () => {}, cancel: () => {} }, delay: async () => {} })
})

describe('NarrationPanel', () => {
  it('narrates the game to the end and lists the concepts it mentioned', async () => {
    render(<NarrationPanel games={games} text={TEXT} />)
    fireEvent.click(screen.getByRole('button', { name: /Narrar/ }))
    await waitFor(() => expect(screen.getByText('Fin de la partida.')).toBeInTheDocument())
    expect(screen.getByText('Clavada')).toBeInTheDocument()
    expect(useStudyBoardStore.getState().currentNodeId).toBe(games[0].tree.mainline[4])
  })

  it('in "Yo muevo" mode asks for the announced move on the board', async () => {
    render(<NarrationPanel games={games} text={TEXT} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Yo muevo' }))
    fireEvent.click(screen.getByRole('button', { name: /Narrar/ }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('e2 → e4'))
    useStudyBoardStore.getState().playMove('d2', 'd4', games[0].tree.startFen)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Esa no es la jugada anunciada.'))
    useStudyBoardStore.getState().playMove('e2', 'e4', games[0].tree.startFen)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('e7 → e5'))
  })

  it('shows the sentence being read and the legend of what is lit', async () => {
    render(<NarrationPanel games={games} text={TEXT} />)
    const idx = useNarrationStore.getState().script.findIndex((s) => s.kind === 'comment')
    fireEvent.click(screen.getByRole('button', { name: 'Paso siguiente' }))
    useNarrationStore.getState().goTo(idx)
    await waitFor(() => expect(screen.getByText('Las negras sostienen el peón de e5.')).toBeInTheDocument())
    expect(screen.getByText('Pieza mencionada')).toBeInTheDocument()
  })
})

describe('cuesToBoard', () => {
  it('colours squares by role, makes named pieces blink and draws the arrows', () => {
    const board = cuesToBoard([
      { kind: 'line', label: '', squares: [{ square: 'b3', role: 'line' }, { square: 'f7', role: 'line' }], arrows: [], start: 0, end: 0 },
      {
        kind: 'relation', label: '', start: 0, end: 0,
        squares: [{ square: 'b3', role: 'attacker', blink: true }, { square: 'f7', role: 'target', blink: true }],
        arrows: [{ from: 'b3', to: 'f7', role: 'attacker' }],
      },
    ])
    // The attacker/target roles win over the line the squares also lie on.
    expect(board.squareStyles.b3.boxShadow).toContain(CUE_COLORS.attacker)
    expect(board.squareStyles.f7.boxShadow).toContain(CUE_COLORS.target)
    expect(board.squareStyles.b3.animation).toContain('cue-blink')
    expect(board.arrows).toEqual([{ startSquare: 'b3', endSquare: 'f7', color: CUE_COLORS.attacker }])
    expect(isCueArrow(board.arrows[0])).toBe(true)
    expect(isCueArrow({ startSquare: 'a1', endSquare: 'a2', color: 'red' })).toBe(false)
  })
})

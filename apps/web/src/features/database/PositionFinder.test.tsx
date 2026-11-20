import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const lookup = vi.hoisted(() => vi.fn())
vi.mock('../library/commentdb/commentLookup', () => ({ lookupPositionComments: lookup }))

import PositionFinder from './PositionFinder'

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const found = { text: 'The king pawn opens lines.', lang: 'en', ply: 1, san: 'e4', gameId: '1-1', label: null, source: { kind: 'book', title: 'Invented Book', author: 'A. Writer' }, translations: { es: 'El peón de rey abre líneas.' } }

beforeEach(() => {
  cleanup()
  lookup.mockReset()
  lookup.mockResolvedValue([found])
})

const type = (text: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'FEN or PGN' }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Find' }))
}

describe('Find by position (S2)', () => {
  it('shows the comments of a pasted FEN', async () => {
    render(<PositionFinder />)
    type(AFTER_E4)
    expect(await screen.findByText('The king pawn opens lines.')).toBeTruthy()
    expect(lookup).toHaveBeenCalledWith(AFTER_E4)
    expect(screen.getByText(/Invented Book/)).toBeTruthy()
    expect(screen.getByText('El peón de rey abre líneas.')).toBeTruthy()
  })

  it('lists the moves of a PGN and shows the comments of the selected move', async () => {
    render(<PositionFinder />)
    type('1. e4 e5 2. Nf3 *')
    const list = await screen.findByRole('list', { name: 'Moves' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['1. e4', '1... e5', '2. Nf3'])
    expect(lookup).not.toHaveBeenCalled()
    fireEvent.click(within(list).getByRole('button', { name: '1. e4' }))
    await waitFor(() => expect(lookup).toHaveBeenCalledWith(AFTER_E4))
    expect(await screen.findByText('The king pawn opens lines.')).toBeTruthy()
  })

  it('says when the position has no comments', async () => {
    lookup.mockResolvedValue([])
    render(<PositionFinder />)
    type(AFTER_E4)
    expect(await screen.findByText('No comments for this position.')).toBeTruthy()
  })

  it('shows an error for invalid input and does not look anything up', async () => {
    render(<PositionFinder />)
    type('not chess')
    expect((await screen.findByRole('alert')).textContent).toMatch(/not a valid FEN or PGN/i)
    expect(lookup).not.toHaveBeenCalled()
  })
})

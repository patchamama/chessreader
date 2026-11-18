import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as inBook from '../database/openInBook'
import { OpenBookAtTrap } from './OpenBookAtTrap'

describe('a trap of Lococo\'s book opens the book where it is', () => {
  it('opens the book at the trap\'s chapter', async () => {
    const spy = vi.spyOn(inBook, 'openGameInBook').mockResolvedValue('/read/-1')
    render(<MemoryRouter><Routes>
      <Route path="/" element={<OpenBookAtTrap book={{ id: 'aprende-a-hacer-trampas-al-ajedrez', title: 'Aprende a hacer trampas al ajedrez' }} chapter={8} />} />
      <Route path="/read/:id" element={<p>Reader open</p>} />
    </Routes></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Open the book at this trap' }))
    expect(await screen.findByText('Reader open')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'aprende-a-hacer-trampas-al-ajedrez', title: 'Aprende a hacer trampas al ajedrez' }), { chapter: 8, gameIndex: null })
  })

  it('renders nothing outside a router', () => {
    const { container } = render(<OpenBookAtTrap book={{ id: 'x', title: 'X' }} chapter={1} />)
    expect(container.innerHTML).toBe('')
  })
})

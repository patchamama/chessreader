import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../../shared/chess/diagramApi', () => ({ regenerateDiagram: vi.fn() }))

import { DiagramImage } from '../DiagramImage'
import { useStudyBoardStore } from '../../store/studyBoardStore'

const FEN = '7k/8/8/8/8/8/8/R6K w - - 0 1'

describe('a diagram that holds a FEN', () => {
  beforeEach(() => useStudyBoardStore.getState().reset())

  it('shows its position on the analysis board when clicked', () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} textFen={FEN} />)
    fireEvent.click(screen.getByRole('img', { name: 'diagram' }))
    expect(useStudyBoardStore.getState().playFen).toBe(FEN)
  })

  it('also when the position is known without a printed FEN line (a FEN in the data)', () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} fenKnown />)
    fireEvent.click(screen.getByRole('img', { name: 'diagram' }))
    expect(useStudyBoardStore.getState().playFen).toBe(FEN)
  })

  it('a diagram with no real FEN (only inferred from the moves) does nothing', () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)
    fireEvent.click(screen.getByRole('img', { name: 'diagram' }))
    expect(useStudyBoardStore.getState().playFen).toBeNull()
  })

  it('the FEN button sits above the diagram, outside it (never over the board)', () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} textFen={FEN} />)
    const wrapper = screen.getByRole('button', { name: 'Show FEN' }).parentElement!
    expect(wrapper.className).toContain('bottom-full')
    expect(wrapper.className).not.toMatch(/\btop-1\b/)
  })

  it('clicking the FEN button does not move the board', () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} textFen={FEN} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show FEN' }))
    expect(useStudyBoardStore.getState().playFen).toBeNull()
  })
})

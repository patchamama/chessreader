import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import RatingStars from './RatingStars'

describe('RatingStars', () => {
  it('sets a rating', () => {
    const onChange = vi.fn()
    render(<RatingStars value={null} onChange={onChange} label="My rating" />)
    fireEvent.click(screen.getByRole('button', { name: '4 stars' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })
  it('clears when the same star is clicked', () => {
    const onChange = vi.fn()
    render(<RatingStars value={3} onChange={onChange} label="My rating" />)
    fireEvent.click(screen.getByRole('button', { name: '3 stars' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

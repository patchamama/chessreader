import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Banner from '../components/Banner'

describe('Banner', () => {
  it('renders the version string', () => {
    render(<Banner version="0.1.0" />)
    expect(screen.getByText('0.1.0')).toBeInTheDocument()
  })
})

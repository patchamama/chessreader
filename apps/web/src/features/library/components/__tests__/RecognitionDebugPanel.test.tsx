import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { RecognitionDebugPanel } from '../RecognitionDebugPanel'

describe('RecognitionDebugPanel', () => {
  it('shows the chapter games as clean lines with a variation count', () => {
    render(<RecognitionDebugPanel chapterText="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6" />)
    expect(screen.getByText(/Game 1/)).toBeInTheDocument()
    expect(screen.getByText(/variation\(s\)/)).toBeInTheDocument()
  })

  it('parses arbitrary test text and shows its lines', () => {
    render(<RecognitionDebugPanel chapterText="" />)
    const textarea = screen.getByPlaceholderText(/Paste a text with moves/)
    fireEvent.change(textarea, { target: { value: '1. d4 d5 2. c4 e6' } })
    expect(screen.getAllByText(/Game 1/).length).toBeGreaterThan(0)
  })

  it('loads the current chapter text into the test box', () => {
    render(<RecognitionDebugPanel chapterText="1. e4 c5 2. Nf3 d6" />)
    fireEvent.click(screen.getByText('Load current chapter'))
    const textarea = screen.getByPlaceholderText(/Paste a text with moves/) as HTMLTextAreaElement
    expect(textarea.value).toBe('1. e4 c5 2. Nf3 d6')
  })

  it('switches recognition algorithm and exposes a hint', () => {
    render(<RecognitionDebugPanel chapterText="1. e4 e5" />)
    const algo1 = screen.getByRole('button', { name: '1' })
    expect(algo1).toHaveAttribute('title', expect.stringContaining('Mainline only'))
    fireEvent.click(algo1)
    expect(screen.getByText(/Game 1/)).toBeInTheDocument()
  })

  it('renders the lines from the node contents (canonical SAN), not the source text', () => {
    render(<RecognitionDebugPanel chapterText="1. ♘f3 ♘f6 2. c4 g6" />)
    const line = screen.getByTestId('debug-line-0')
    expect(line.textContent).toBe('1. Nf3 Nf6 2. c4 g6')
  })

  it('shows the exact games handed by the reader instead of re-recognising', () => {
    const games = recognizeGames('1. d4 d5 2. c4 e6')
    render(<RecognitionDebugPanel chapterText="1. e4 e5" games={games} />)
    expect(screen.getByTestId('debug-line-0').textContent).toBe('1. d4 d5 2. c4 e6')
  })

  it('lists every node with id, parent, number, SAN, source token and offsets', () => {
    render(<RecognitionDebugPanel chapterText="1. ♘f3 ♘f6" />)
    fireEvent.click(screen.getByRole('button', { name: 'Nodes' }))
    const rows = screen.getAllByTestId('debug-node-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('node-1')
    expect(rows[0].textContent).toContain('root')
    expect(rows[0].textContent).toContain('1.')
    expect(rows[0].textContent).toContain('Nf3')
    expect(rows[0].textContent).toContain('♘f3')
    expect(rows[0].textContent).toContain('3–6')
    expect(rows[1].textContent).toContain('node-1')
    expect(rows[1].textContent).toContain('1...')
  })
})

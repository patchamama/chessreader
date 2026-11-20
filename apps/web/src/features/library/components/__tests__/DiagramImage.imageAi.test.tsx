import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('../../../../shared/chess/diagramApi', () => ({ regenerateDiagram: vi.fn() }))

import { DiagramImage } from '../DiagramImage'
import { useSessionFenStore } from '../../imageAi/sessionFens'
import { registeredDiagrams } from '../../imageAi/diagramRegistry'
import { useSettingsStore } from '../../../../shared/settings/settingsStore'

const SRC = '/api/library/books/16/images/d1.png'
const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const FOUND = '6k1/5pp1/7p/8/8/8/5PPP/R5K1 w - - 0 30'

describe('DiagramImage image AI', () => {
  beforeEach(() => {
    useSessionFenStore.setState({ fens: {} })
    useSettingsStore.getState().reset()
  })

  it('shows the AI icon above the image when moves follow it, even without an AI model', () => {
    render(<DiagramImage src={SRC} alt="diagram" fen={FEN} followingText="30.Ra8+ Kh7" />)
    expect(screen.getByRole('button', { name: 'AI actions for this image' })).toBeInTheDocument()
  })

  it('shows no AI icon without a model and without moves after it', () => {
    render(<DiagramImage src={SRC} alt="diagram" fen={FEN} followingText="Plain prose." />)
    expect(screen.queryByRole('button', { name: 'AI actions for this image' })).toBeNull()
  })

  it('takes the position accepted for its image this session', () => {
    const { container } = render(<DiagramImage src={SRC} alt="diagram" fen={FEN} followingText="" />)
    act(() => useSessionFenStore.getState().setFen(SRC, FOUND))
    expect(container.querySelector('[data-diagram-src]')).toHaveAttribute('data-diagram-fen', FOUND)
  })

  it('is registered for the chapter batch and the templates while mounted, with the FEN the book prints', () => {
    const { unmount } = render(<DiagramImage src={SRC} alt="diagram" fen={FEN} textFen={FEN} followingText="1.e4" />)
    expect(registeredDiagrams().map((d) => [d.src, d.printedFen, d.followingText])).toEqual([[SRC, FEN, '1.e4']])
    unmount()
    expect(registeredDiagrams()).toEqual([])
  })
})

describe('DiagramImage following text', () => {
  it('reads the moves after its mount in the chapter when the reader gives none', () => {
    const content = document.createElement('div')
    content.className = 'epub-content'
    content.innerHTML = '<p><span data-diagram-overlay="1" id="mount"></span></p><p>30.Ra8+ Kh7</p><p><img src="next.png"></p><p>99.a4</p>'
    document.body.appendChild(content)
    render(<DiagramImage src={SRC} alt="diagram" fen={FEN} />, { container: content.querySelector('#mount') as HTMLElement })
    expect(registeredDiagrams().find((d) => d.src === SRC)?.followingText.trim()).toBe('30.Ra8+ Kh7')
    expect(screen.getByRole('button', { name: 'AI actions for this image' })).toBeInTheDocument()
    content.remove()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../../shared/chess/diagramApi', () => ({
  regenerateDiagram: vi.fn(),
}))

import { DiagramImage } from '../DiagramImage'
import { regenerateDiagram } from '../../../../shared/chess/diagramApi'
import { useSettingsStore } from '../../../../shared/settings/settingsStore'
import { useDiagramStyleStore } from '../../utils/boardSvg'

const mockRegen = vi.mocked(regenerateDiagram)

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

describe('DiagramImage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useSettingsStore.setState({
      diagramBoardTheme: 'classic',
      diagramPieceTheme: 'merida',
      diagramCoordinates: false,
    })
    // The server-rendered themes; the default book style draws in the browser.
    useDiagramStyleStore.setState({ style: 'theme' })
    mockRegen.mockResolvedValue({
      svg: '<svg id="gen"/>',
      footer: '+0.3',
      eval: { scoreCp: 30, pv: ['e7e5'], engineName: 'Stockfish 18' },
    })
  })

  it('shows the original book image by default', () => {
    render(<DiagramImage src="/api/library/books/1/images/x.jpg" alt="diagram" fen={FEN} />)
    const img = screen.getByRole('img', { name: 'diagram' })
    expect(img).toHaveAttribute('src', '/api/library/books/1/images/x.jpg')
    // no regeneration until requested
    expect(mockRegen).not.toHaveBeenCalled()
  })

  it('the refresh icon requests a regeneration and shows the SVG + eval footer', async () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)

    await userEvent.click(screen.getByRole('button', { name: /regenerate diagram/i }))

    await waitFor(() => expect(mockRegen).toHaveBeenCalled())
    // SVG injected
    await waitFor(() => expect(document.querySelector('#gen')).toBeTruthy())
    // footer formatted from the structured eval (white POV; black to move => negated)
    await waitFor(() =>
      expect(screen.getByText(/SF18: \(-0\.30\)/)).toBeInTheDocument(),
    )
  })

  it('passes the configured board theme + piece set + coordinates to the API', async () => {
    useSettingsStore.setState({
      diagramBoardTheme: 'blue',
      diagramPieceTheme: 'fantasy',
      diagramCoordinates: true,
    })
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)

    await userEvent.click(screen.getByRole('button', { name: /regenerate diagram/i }))

    await waitFor(() =>
      expect(mockRegen).toHaveBeenCalledWith(
        expect.objectContaining({
          fen: FEN,
          pieceSet: 'fantasy',
          coordinates: true,
          lightColor: '#dee3e6',
          darkColor: '#5a80a7',
        }),
      ),
    )
  })

  it('toggling back shows the original image again', async () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)

    await userEvent.click(screen.getByRole('button', { name: /regenerate diagram/i }))
    await waitFor(() => expect(document.querySelector('#gen')).toBeTruthy())

    await userEvent.click(screen.getByRole('button', { name: /show original image/i }))
    expect(screen.getByRole('img', { name: 'diagram' })).toBeInTheDocument()
  })

  it('right-clicking the generated board opens the config menu', async () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)
    await userEvent.click(screen.getByRole('button', { name: /regenerate diagram/i }))
    await waitFor(() => expect(document.querySelector('#gen')).toBeTruthy())

    fireEvent.contextMenu(screen.getByTestId('diagram-generated'))

    expect(screen.getByRole('menu', { name: /diagram settings/i })).toBeInTheDocument()
    // changing the piece set re-requests a regeneration
    await userEvent.selectOptions(screen.getByLabelText(/piece set/i), 'fantasy')
    await waitFor(() =>
      expect(mockRegen).toHaveBeenLastCalledWith(expect.objectContaining({ pieceSet: 'fantasy' })),
    )
  })

  it('editing the FEN regenerates with the edited position', async () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)
    await userEvent.click(screen.getByRole('button', { name: /regenerate diagram/i }))
    await waitFor(() => expect(document.querySelector('#gen')).toBeTruthy())

    fireEvent.contextMenu(screen.getByTestId('diagram-generated'))
    await userEvent.click(screen.getByRole('button', { name: /edit fen/i }))

    const input = screen.getByLabelText(/fen/i)
    const NEW_FEN = '8/8/8/8/8/5k2/Q7/5K2 w - - 0 1'
    await userEvent.clear(input)
    await userEvent.type(input, NEW_FEN)
    await userEvent.click(screen.getByRole('button', { name: /apply fen/i }))

    await waitFor(() =>
      expect(mockRegen).toHaveBeenLastCalledWith(expect.objectContaining({ fen: NEW_FEN })),
    )
  })

  it('a diagram whose FEN line was hidden shows a FEN symbol that reveals the position and its board', async () => {
    const TEXT_FEN = '3b4/pp6/8/8/2k1K1P1/2p5/P3N2P/8 w - - 0 1'
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={TEXT_FEN} textFen={TEXT_FEN} />)
    expect(screen.queryByText(TEXT_FEN)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /show fen/i }))

    const hint = screen.getByRole('tooltip')
    expect(hint).toHaveTextContent(TEXT_FEN)
    const board = screen.getByRole('img', { name: /fen diagram/i })
    expect(board.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  })

  it('a diagram without a FEN line in the text shows no FEN symbol', () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)
    expect(screen.queryByRole('button', { name: /show fen/i })).toBeNull()
  })

  it('the refresh icon sits just above the diagram, not over the board', () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)
    const button = screen.getByRole('button', { name: /regenerate diagram/i })
    expect(button.className).toMatch(/\bbottom-full\b/)
    expect(button.className).not.toMatch(/\btop-1\b/)
    expect(button.querySelector('svg')).toBeTruthy()
  })

  it('clicking the refresh icon again regenerates the generated board', async () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)
    await userEvent.click(screen.getByRole('button', { name: /regenerate diagram/i }))
    await waitFor(() => expect(mockRegen).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: /regenerate diagram/i }))
    await waitFor(() => expect(mockRegen).toHaveBeenCalledTimes(2))
  })

  it('the default book style is drawn in the browser from the diagram FEN, without the server', async () => {
    useDiagramStyleStore.setState({ style: 'book' })
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)
    await userEvent.click(screen.getByRole('button', { name: /regenerate diagram/i }))
    const board = await screen.findByTestId('diagram-generated')
    expect(board.querySelector('pattern')).toBeTruthy()
    expect(board.querySelectorAll('[data-piece]')).toHaveLength(32)
    expect(mockRegen).not.toHaveBeenCalled()
  })

  it('the style menu offers the book style first and keeps the other board themes', async () => {
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)
    await userEvent.click(screen.getByRole('button', { name: /regenerate diagram/i }))
    await waitFor(() => expect(document.querySelector('#gen')).toBeTruthy())
    fireEvent.contextMenu(screen.getByTestId('diagram-generated'))
    const select = screen.getByLabelText(/board theme/i) as HTMLSelectElement
    const labels = [...select.options].map((o) => o.textContent)
    expect(labels[0]).toBe('Book (black & white, hatched dark squares)')
    expect(labels).toContain('Blue')
    await userEvent.selectOptions(select, 'book')
    expect(useDiagramStyleStore.getState().style).toBe('book')
    await userEvent.selectOptions(screen.getByLabelText(/board theme/i), 'green')
    expect(useDiagramStyleStore.getState().style).toBe('theme')
    expect(useSettingsStore.getState().diagramBoardTheme).toBe('green')
  })

  it('a server failure still draws the board in the browser', async () => {
    mockRegen.mockRejectedValue(new Error('down'))
    render(<DiagramImage src="/x.jpg" alt="diagram" fen={FEN} />)
    await userEvent.click(screen.getByRole('button', { name: /regenerate diagram/i }))
    await waitFor(() => expect(screen.getByTestId('diagram-generated').querySelectorAll('[data-piece]')).toHaveLength(32))
  })

  it('exposes its image and position for the diagram tools', () => {
    const { container } = render(<DiagramImage src="/i/qed_5e.jpg" alt="diagram" fen={FEN} />)
    const root = container.querySelector('[data-diagram-src]')!
    expect(root.getAttribute('data-diagram-src')).toBe('/i/qed_5e.jpg')
    expect(root.getAttribute('data-diagram-fen')).toBe(FEN)
  })

  it('a missing image whose position is known is replaced by a regenerated diagram (S8)', async () => {
    useDiagramStyleStore.setState({ style: 'book' })
    render(<DiagramImage src="/missing.jpg" alt="diagram" fen={FEN} fenKnown />)
    fireEvent.error(screen.getByRole('img', { name: 'diagram' }))
    const board = await screen.findByTestId('diagram-generated')
    expect(board.querySelectorAll('[data-piece]')).toHaveLength(32)
  })

  it('a missing image whose position is not known stays as it is (S8)', () => {
    render(<DiagramImage src="/missing.jpg" alt="diagram" fen={FEN} />)
    fireEvent.error(screen.getByRole('img', { name: 'diagram' }))
    expect(screen.queryByTestId('diagram-generated')).toBeNull()
    expect(screen.getByRole('img', { name: 'diagram' })).toBeInTheDocument()
  })
})

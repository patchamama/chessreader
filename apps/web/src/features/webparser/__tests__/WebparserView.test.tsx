import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import WebparserView from '../components/WebparserView'
import { useViewerStore } from '../../viewer/store/viewerStore'

// Mock useParseWebpage
vi.mock('../api/webparserApi', () => ({
  useParseWebpage: vi.fn(),
}))

// Mock InlineGame to avoid chessboard canvas complexity
vi.mock('../../viewer/components/InlineGame', () => ({
  default: ({ treeId }: { treeId: string }) => (
    <div data-testid={`inline-game-${treeId}`}>InlineGame</div>
  ),
}))

import { useParseWebpage } from '../api/webparserApi'
const mockUseParseWebpage = vi.mocked(useParseWebpage)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMutationResult(overrides: Record<string, unknown>): any {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    data: undefined,
    error: null,
    isError: false,
    isPending: false,
    isIdle: true,
    isSuccess: false,
    isPaused: false,
    variables: undefined,
    context: undefined,
    failureCount: 0,
    failureReason: null,
    status: 'idle' as const,
    submittedAt: 0,
    reset: vi.fn(),
    ...overrides,
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const MOCK_DATA = {
  html: '<p>After <img src="diag.jpg" alt="pos"> in the game 1. e4 e5</p>',
  games: [
    {
      charStart: 0,
      charEnd: 8,
      source: '1. e4 e5',
      tree: {
        startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        nodes: { 'n1': { id: 'n1', san: 'e4', fen: '', parentId: null, moveNumber: 1, color: 'w' } },
        mainline: ['n1'],
        variations: {},
      },
    },
  ],
  images: [{ src: 'diag.jpg', alt: 'pos' }],
}

describe('WebparserView', () => {
  beforeEach(() => {
    useViewerStore.setState({ currentNodeId: {}, orientation: 'white', isInVariation: {} })
    mockUseParseWebpage.mockReturnValue(makeMutationResult({}))
  })

  it('renders URL input and Parse button', () => {
    render(<WebparserView />, { wrapper })
    expect(screen.getByRole('textbox', { name: /url/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /parse/i })).toBeInTheDocument()
  })

  it('calls mutate with the url on submit', async () => {
    const mutate = vi.fn()
    mockUseParseWebpage.mockReturnValue(makeMutationResult({ mutate }))

    render(<WebparserView />, { wrapper })

    await userEvent.type(screen.getByRole('textbox'), 'https://example.com/chess')
    await userEvent.click(screen.getByRole('button', { name: /parse/i }))

    expect(mutate).toHaveBeenCalledWith('https://example.com/chess')
  })

  it('shows inline game boards after successful parse in normal mode', async () => {
    mockUseParseWebpage.mockReturnValue(makeMutationResult({ data: MOCK_DATA, isSuccess: true }))

    render(<WebparserView />, { wrapper })

    await waitFor(() => {
      expect(screen.getByTestId('inline-game-webparser-game-0')).toBeInTheDocument()
    })
  })

  it('shows substitution mode radio and can switch', async () => {
    mockUseParseWebpage.mockReturnValue(makeMutationResult({ data: MOCK_DATA, isSuccess: true }))

    render(<WebparserView />, { wrapper })

    await waitFor(() => screen.getByLabelText(/substitution/i))

    const subRadio = screen.getByLabelText(/substitution/i)
    await userEvent.click(subRadio)

    expect(subRadio).toBeChecked()
  })

  it('shows error message on parse failure', async () => {
    mockUseParseWebpage.mockReturnValue(
      makeMutationResult({ isError: true, error: new Error('Failed to fetch URL') })
    )

    render(<WebparserView />, { wrapper })

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch URL')
  })

  it('disables button while pending', () => {
    mockUseParseWebpage.mockReturnValue(makeMutationResult({ isPending: true }))

    render(<WebparserView />, { wrapper })

    expect(screen.getByRole('button', { name: /parsing/i })).toBeDisabled()
  })

  it('substitution mode renders inline game instead of diagram img', async () => {
    mockUseParseWebpage.mockReturnValue(makeMutationResult({ data: MOCK_DATA, isSuccess: true }))

    render(<WebparserView />, { wrapper })

    // Switch to substitution mode
    await waitFor(() => screen.getByLabelText(/substitution/i))
    await userEvent.click(screen.getByLabelText(/substitution/i))

    // The inline game should render in substitution mode at position of the img
    await waitFor(() => {
      expect(screen.getByTestId('inline-game-webparser-0')).toBeInTheDocument()
    })
  })
})

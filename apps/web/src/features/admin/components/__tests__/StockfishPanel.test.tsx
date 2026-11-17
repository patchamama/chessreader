import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StockfishPanel from '../StockfishPanel'

const STATUS = {
  latest: { tag: 'sf_19', name: 'Stockfish 19', publishedAt: '2026-09-05T08:33:17Z', prerelease: false, available: true },
  latestInstalled: false,
  releases: [
    { tag: 'stockfish-dev-20261115', name: 'Stockfish dev-20261115', publishedAt: '2026-11-15T08:12:39Z', prerelease: true, available: true },
    { tag: 'sf_19', name: 'Stockfish 19', publishedAt: '2026-09-05T08:33:17Z', prerelease: false, available: true },
    { tag: 'sf_18', name: 'Stockfish 18', publishedAt: '2026-01-31T14:33:53Z', prerelease: false, available: true },
  ],
  installed: ['sf_18'],
  selected: 'system',
  system: '/opt/homebrew/bin/stockfish',
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><StockfishPanel /></QueryClientProvider>)
}

afterEach(() => vi.unstubAllGlobals())

describe('StockfishPanel (S2)', () => {
  it('says the latest release is not installed yet and offers it, with the versions to choose from', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/install')) return new Response(JSON.stringify({ ...STATUS, installed: ['sf_19', 'sf_18'], latestInstalled: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/selected')) return new Response(JSON.stringify({ ...STATUS, installed: ['sf_19', 'sf_18'], selected: JSON.parse(String(init?.body)).tag }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify(STATUS), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPanel()
    await waitFor(() => expect(screen.getByText(/Stockfish 19 is the latest release/)).toBeInTheDocument())
    expect(screen.getByText(/not installed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Download Stockfish 19' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/admin/engine/stockfish/install'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ tag: 'sf_19' }) })))
    const select = await screen.findByLabelText('Engine in use')
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual(['system', 'sf_19', 'sf_18'])
    fireEvent.change(select, { target: { value: 'sf_19' } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/admin/engine/stockfish/selected'), expect.objectContaining({ method: 'PUT' })))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const api = vi.hoisted(() => ({ loadTopPositions: vi.fn(), hideComment: vi.fn() }))
vi.mock('../comments/commentsApi', async (orig) => ({ ...(await orig<typeof import('../comments/commentsApi')>()), ...api }))
const lookup = vi.hoisted(() => vi.fn())
vi.mock('../library/commentdb/commentLookup', () => ({ lookupPositionComments: lookup }))
vi.mock('../../shared/llm', () => ({ useLlm: () => ({ available: false, vision: false, config: null, complete: vi.fn() }) }))

import RankingView from './RankingView'

const WHITE = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const BLACK = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const rows = [
  { rank: 1, fen: BLACK, count: 12, sources: [{ id: 1, title: 'Mis geniales predecesores I', author: 'Kasparov', book: 'mgp1', kind: 'book', lang: 'es', count: 9 }, { id: 2, title: 'Lichess studies', author: null, book: null, kind: 'lichess', lang: 'en', count: 3 }], samples: [{ id: 1, ply: 1, move: 1, san: 'e4', text: 'The king pawn.' }, { id: 2, ply: 1, move: 1, san: 'e4', text: 'x'.repeat(300) }] },
  { rank: 2, fen: WHITE, count: 7, sources: [], samples: [] },
]
const line = (cp: number) => [{ idx: 1, pv: ['e2e4'], scoreCp: cp, depth: 12 }]
const found = { id: 5, text: 'A remark.', lang: 'en', ply: 1, san: 'e4', gameId: '1-1', label: null, source: { kind: 'book', title: 'Invented Book', author: 'A. Writer' } }

beforeEach(() => {
  cleanup()
  try { localStorage.clear() } catch { /* none */ }
  api.loadTopPositions.mockReset()
  api.loadTopPositions.mockResolvedValue(rows)
  api.hideComment.mockReset()
  lookup.mockReset()
  lookup.mockResolvedValue([found])
})

describe('Ranking of the most commented positions (S23)', () => {
  it('lists the positions in rank order with diagram, count and reference data', async () => {
    render(<RankingView filter={{}} analyse={async () => line(30)} onOpenInFinder={() => {}} />)
    const list = await screen.findByRole('list', { name: 'Ranking' })
    const items = within(list).getAllByRole('listitem', { name: /^Rank \d/ })
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual(['Rank 1', 'Rank 2'])
    const first = within(items[0])
    expect(first.getByText('12 comments')).toBeTruthy()
    expect(first.getByRole('img', { name: 'Position ranked 1' }).getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(first.getByText('Black to move')).toBeTruthy()
    expect(first.getByText(/Mis geniales predecesores I · Kasparov — 9/)).toBeTruthy()
    expect(first.getByText('lichess')).toBeTruthy()
    expect(first.getAllByText(/1\. e4/)).toHaveLength(2)
    expect(first.getByText(/x{20,}…$/)).toBeTruthy()
    expect(screen.getByText(/Top 50 · 2 positions/)).toBeTruthy()
  })

  it('passes the filters and the top size, and reloads', async () => {
    render(<RankingView filter={{ q: 'pin', lang: 'es' }} analyse={async () => line(0)} onOpenInFinder={() => {}} />)
    await screen.findByRole('list', { name: 'Ranking' })
    expect(api.loadTopPositions).toHaveBeenCalledWith({ q: 'pin', lang: 'es' }, 50)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(api.loadTopPositions).toHaveBeenCalledTimes(2))
  })

  it('evaluates one position at a time from White\'s point of view, with progress', async () => {
    let live = 0
    let peak = 0
    const release: Array<() => void> = []
    const analyse = vi.fn((fen: string) => new Promise<ReturnType<typeof line>>((resolve) => {
      live++
      peak = Math.max(peak, live)
      release.push(() => { live--; resolve(line(fen === BLACK ? 50 : 35)) })
    }))
    render(<RankingView filter={{}} analyse={analyse} onOpenInFinder={() => {}} />)
    expect((await screen.findByRole('status')).textContent).toBe('Evaluating 1 of 2')
    expect(screen.getAllByText('…').length).toBeGreaterThan(0)
    await waitFor(() => expect(release).toHaveLength(1))
    release[0]()
    await waitFor(() => expect(release).toHaveLength(2))
    expect(screen.getByRole('status').textContent).toBe('Evaluating 2 of 2')
    release[1]()
    expect(await screen.findByText('-0.50')).toBeTruthy()
    expect(screen.getByText('+0.35').getAttribute('title')).toBe('Depth 12')
    expect(peak).toBe(1)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('uses the remembered evaluations instead of asking the engine again', async () => {
    const analyse = vi.fn(async () => line(20))
    const view = render(<RankingView filter={{}} analyse={analyse} onOpenInFinder={() => {}} />)
    await screen.findAllByText('+0.20')
    expect(analyse).toHaveBeenCalledTimes(2)
    view.unmount()
    const again = vi.fn(async () => line(99))
    render(<RankingView filter={{}} analyse={again} onOpenInFinder={() => {}} />)
    expect((await screen.findAllByText(/^[+-]0\.20$/)).length).toBeGreaterThan(0)
    expect(again).not.toHaveBeenCalled()
  })

  it('shows n/a when the engine fails, and keeps working', async () => {
    render(<RankingView filter={{}} analyse={async () => { throw new Error('no worker') }} onOpenInFinder={() => {}} />)
    await waitFor(() => expect(screen.getAllByText('n/a')).toHaveLength(2))
    expect(screen.getByText('12 comments')).toBeTruthy()
  })

  it('opens a position in Find by position', async () => {
    const open = vi.fn()
    render(<RankingView filter={{}} analyse={async () => line(0)} onOpenInFinder={open} />)
    const first = await screen.findByRole('listitem', { name: 'Rank 1' })
    fireEvent.click(within(first).getByRole('button', { name: 'Open in Find by position' }))
    expect(open).toHaveBeenCalledWith(BLACK)
  })

  it('expands the comments of a row, where they can be hidden', async () => {
    api.hideComment.mockResolvedValue(undefined)
    render(<RankingView filter={{}} analyse={async () => line(0)} onOpenInFinder={() => {}} />)
    const first = await screen.findByRole('listitem', { name: 'Rank 1' })
    fireEvent.click(within(first).getByRole('button', { name: 'Show comments' }))
    expect(await within(first).findByText('A remark.')).toBeTruthy()
    expect(lookup).toHaveBeenCalledWith(BLACK)
    fireEvent.click(within(first).getByRole('button', { name: 'Hide' }))
    fireEvent.click(within(first).getByRole('button', { name: 'Yes, hide' }))
    await waitFor(() => expect(api.hideComment).toHaveBeenCalledWith(5))
    await waitFor(() => expect(within(first).queryByText('A remark.')).toBeNull())
  })

  it('opens the editor from an expanded comment', async () => {
    render(<RankingView filter={{}} analyse={async () => line(0)} onOpenInFinder={() => {}} />)
    const first = await screen.findByRole('listitem', { name: 'Rank 1' })
    fireEvent.click(within(first).getByRole('button', { name: 'Show comments' }))
    fireEvent.click(await within(first).findByRole('button', { name: /Edit comment/ }))
    expect(screen.getByRole('dialog', { name: /details/ })).toBeTruthy()
  })

  it('shows a read error', async () => {
    api.loadTopPositions.mockRejectedValue(new Error('boom'))
    render(<RankingView filter={{}} analyse={async () => line(0)} onOpenInFinder={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/boom/)
  })
})

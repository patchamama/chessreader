import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../api/httpClient', () => ({
  httpClient: vi.fn(),
}))

import { regenerateDiagram } from '../diagramApi'
import { httpClient } from '../../api/httpClient'

const mockHttp = vi.mocked(httpClient)

describe('diagramApi.regenerateDiagram', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockHttp.mockResolvedValue({ svg: '<svg/>', footer: '+1.3', eval: { scoreCp: 130 } })
  })

  it('POSTs /api/diagrams/regenerate with fen + render options', async () => {
    await regenerateDiagram({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      lightColor: '#dee3e6',
      darkColor: '#5a80a7',
      pieceSet: 'fantasy',
      coordinates: true,
    })

    expect(mockHttp).toHaveBeenCalledWith('/api/diagrams/regenerate', {
      method: 'POST',
      body: JSON.stringify({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        lightColor: '#dee3e6',
        darkColor: '#5a80a7',
        pieceSet: 'fantasy',
        coordinates: true,
      }),
    })
  })

  it('returns the svg + eval payload', async () => {
    const result = await regenerateDiagram({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    })
    expect(result.svg).toBe('<svg/>')
    expect(result.eval).toEqual({ scoreCp: 130 })
  })
})

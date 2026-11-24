import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../commentdb/commentLookup', () => ({ hasCommentSource: () => true, lookupPositionComments: vi.fn(async () => []) }))
import { narratorActionsFor } from './commentActions'
import { guideKey, useGuideStore } from './guideStore'

const FEN = 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 3'
const TEXT = 'Despejando la diagonal de nuestro alfil de casillas blancas y preparando el avance f5!'

beforeEach(() => useGuideStore.getState().clear())

describe('where the narrator gets the actions', () => {
  it('falls back to the local guide when the database has none', async () => {
    useGuideStore.getState().set(guideKey(1, 1, TEXT), { text: TEXT, fen: FEN, actions: '3Arrow:f7-f5' })
    expect(await narratorActionsFor(TEXT, FEN)).toBe('3Arrow:f7-f5')
  })
})

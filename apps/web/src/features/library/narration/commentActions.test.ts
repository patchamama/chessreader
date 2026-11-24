import { beforeEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => vi.fn())
vi.mock('../commentdb/commentLookup', () => ({ lookupPositionComments: lookup, hasCommentSource: () => true }))

import { actionsOfMatching, databaseActionsFor } from './commentActions'

const comment = (text: string, actions?: string) => ({ id: 1, text, lang: 'es', ply: 4, san: 'a6', gameId: 'g', label: null, source: { kind: 'book', title: 'B', author: null }, ...(actions ? { actions } : {}) })
const TEXT = 'Despejando la diagonal de nuestro alfil de casillas blancas y preparando el avance f5!'

beforeEach(() => lookup.mockReset())

describe('the actions of the comment being narrated (S6)', () => {
  it('finds the comment of the database that is the text being narrated, ignoring spacing', () => {
    expect(actionsOfMatching([comment('Otra cosa distinta que no es', '0Clear'), comment(TEXT, '0Diagonal:c8-h3')], `  ${TEXT.replace(' la ', '  la\n')} `)).toBe('0Diagonal:c8-h3')
  })

  it('a comment without actions, or a different one, gives none', () => {
    expect(actionsOfMatching([comment(TEXT)], TEXT)).toBeUndefined()
    expect(actionsOfMatching([comment('Otro comentario largo sobre otra posición', '0Clear')], TEXT)).toBeUndefined()
  })

  it('reads them from the comments of the position, and survives a failing lookup', async () => {
    lookup.mockResolvedValueOnce([comment(TEXT, '0Diagonal:c8-h3')])
    expect(await databaseActionsFor(TEXT, '8/8/8/8/8/8/8/K6k w - - 0 1')).toBe('0Diagonal:c8-h3')
    expect(lookup).toHaveBeenCalledWith('8/8/8/8/8/8/8/K6k w - - 0 1')
    lookup.mockRejectedValueOnce(new Error('offline'))
    expect(await databaseActionsFor(TEXT, 'x')).toBeUndefined()
  })
})

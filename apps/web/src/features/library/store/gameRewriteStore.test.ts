import { describe, it, expect } from 'vitest'
import { useGameRewriteStore, rewriteKey } from './gameRewriteStore'
import { useExternalBookStore } from '../../../shared/externalBook/externalBookStore'

describe('the rewrites of the book opened from outside (external book -1)', () => {
  it('are forgotten when another book is opened there, so they never show on a different book', () => {
    const store = useGameRewriteStore.getState()
    store.save(-1, 1, 0, { text: 'rewritten' })
    store.save(7, 1, 0, { text: 'a library book' })
    expect(useGameRewriteStore.getState().rewrites[rewriteKey(-1, 1)]?.[0]?.text).toBe('rewritten')
    useExternalBookStore.getState().open('Another study', [])
    expect(useGameRewriteStore.getState().rewrites[rewriteKey(-1, 1)]).toBeUndefined()
    expect(useGameRewriteStore.getState().rewrites[rewriteKey(7, 1)]?.[0]?.text).toBe('a library book')
  })
})

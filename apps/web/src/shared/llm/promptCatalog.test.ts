import { describe, expect, it } from 'vitest'
import { PROMPT_CATALOG } from './promptCatalog'

describe('PROMPT_CATALOG', () => {
  it('has unique ids', () => {
    const ids = PROMPT_CATALOG.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers the known situations', () => {
    const ids = PROMPT_CATALOG.map((e) => e.id)
    for (const id of ['comment-universal', 'comment-translate', 'game-translate', 'narration-actions', 'image-fen', 'game-commentary', 'wrong-move-rank']) {
      expect(ids).toContain(id)
    }
  })

  it.each(PROMPT_CATALOG.map((e) => [e.id, e] as const))('%s builds a real request', (_id, entry) => {
    const request = entry.build()
    const text = `${request.system ?? ''}${request.messages.map((m) => m.text).join('')}`
    expect(text.trim().length).toBeGreaterThan(0)
    expect(entry.title).not.toBe('')
    expect(entry.situation).not.toBe('')
    expect(entry.group).not.toBe('')
    expect(entry.answer).not.toBe('')
  })
})

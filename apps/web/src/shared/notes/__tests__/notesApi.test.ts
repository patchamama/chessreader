import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../api/httpClient', () => ({
  httpClient: vi.fn(),
}))

import { fetchNotes, saveNotes } from '../notesApi'
import { httpClient } from '../../api/httpClient'

const mockHttp = vi.mocked(httpClient)

describe('notesApi', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('fetchNotes GETs /api/notes and returns the content string', async () => {
    mockHttp.mockResolvedValue({ content: 'hello' })

    const result = await fetchNotes()

    expect(mockHttp).toHaveBeenCalledWith('/api/notes', { method: 'GET' })
    expect(result).toBe('hello')
  })

  it('saveNotes PUTs /api/notes with the content body', async () => {
    mockHttp.mockResolvedValue({ ok: true })

    await saveNotes('- [ ] task')

    expect(mockHttp).toHaveBeenCalledWith('/api/notes', {
      method: 'PUT',
      body: JSON.stringify({ content: '- [ ] task' }),
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../shared/api/httpClient', () => ({ httpClient: vi.fn() }))

import { httpClient } from '../../shared/api/httpClient'
import { useAuthStore } from '../auth/store/authStore'
import {
  applySuggestionsToEpub, authBlobUrl, downloadEpub, isProtectedAsset, listBackups, listBookImages, restoreBackup, uploadSuggestionAsset,
} from './epubApi'

const http = vi.mocked(httpClient)
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore.setState({ token: 'jwt-placeholder', user: null })
})
afterEach(() => { vi.unstubAllGlobals(); useAuthStore.setState({ token: null, user: null }) })

describe('EPUB routes of a book (S5, S6)', () => {
  it('applies, lists backups and restores one through the admin routes', async () => {
    http.mockResolvedValueOnce({ applied: ['a'], stale: ['b'], backup: '5-20261120T100000Z.epub' })
    expect(await applySuggestionsToEpub(5)).toEqual({ applied: ['a'], stale: ['b'], backup: '5-20261120T100000Z.epub' })
    expect(http).toHaveBeenLastCalledWith('/api/library/books/5/apply-suggestions', { method: 'POST' })

    http.mockResolvedValueOnce({ backups: [{ name: '5-20261120T100000Z.epub', size: 10, createdAt: '2026-11-20T10:00:00Z', applied: 0 }] })
    expect((await listBackups(5)).map((b) => b.name)).toEqual(['5-20261120T100000Z.epub'])

    http.mockResolvedValueOnce({ restored: 'x', backup: 'y', reverted: [], reapplied: [] })
    await restoreBackup(5, '5-20261120T100000Z.epub')
    expect(http).toHaveBeenLastCalledWith('/api/library/books/5/restore-backup', { method: 'POST', body: JSON.stringify({ backup: '5-20261120T100000Z.epub' }) })
  })

  it('lists the images of a book', async () => {
    http.mockResolvedValueOnce({ images: [{ path: 'OEBPS/i.png', url: '/api/library/books/5/images/OEBPS/i.png', cover: true }] })
    expect(await listBookImages(5)).toEqual([{ path: 'OEBPS/i.png', url: '/api/library/books/5/images/OEBPS/i.png', cover: true }])
  })

  it('uploads an image as multipart "file" and returns its url', async () => {
    http.mockResolvedValueOnce({ ok: true, path: 'suggestions/assets/a.png', url: '/api/suggestions/assets/a.png' })
    const file = new File(['x'], 'c.png', { type: 'image/png' })
    expect(await uploadSuggestionAsset(file)).toBe('/api/suggestions/assets/a.png')
    const init = http.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.body as FormData).get('file')).toBe(file)
  })

  it('downloads the EPUB with the token and saves it under the server file name', async () => {
    const click = vi.fn()
    const created: HTMLAnchorElement[] = []
    const orig = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = orig(tag)
      if (tag === 'a') { (el as HTMLAnchorElement).click = click; created.push(el as HTMLAnchorElement) }
      return el
    })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }))
    fetchMock.mockResolvedValue(new Response(new Blob(['epub']), {
      status: 200, headers: { 'Content-Disposition': 'attachment; filename="my-book.epub"' },
    }))
    await downloadEpub(5, 'My Book')
    expect(fetchMock).toHaveBeenCalledWith('/api/library/books/5/epub', { headers: { Authorization: 'Bearer jwt-placeholder' } })
    expect(created[0].download).toBe('my-book.epub')
    expect(click).toHaveBeenCalled()
  })

  it('a refused download reports the server error', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'only the owner or an admin can download this book' }), { status: 403 }))
    await expect(downloadEpub(5, 'My Book')).rejects.toThrow('only the owner or an admin')
  })

  it('uploaded assets are fetched with the token as blob URLs; book images are not protected', async () => {
    expect(isProtectedAsset('/api/suggestions/assets/' + 'a'.repeat(64) + '.png')).toBe(true)
    expect(isProtectedAsset('suggestions/assets/' + 'a'.repeat(64) + '.jpg')).toBe(true)
    expect(isProtectedAsset('/api/library/books/5/images/x.png')).toBe(false)
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:asset'), revokeObjectURL: vi.fn() }))
    fetchMock.mockResolvedValue(new Response(new Blob(['png']), { status: 200 }))
    expect(await authBlobUrl('suggestions/assets/' + 'a'.repeat(64) + '.png')).toBe('blob:asset')
    expect(fetchMock).toHaveBeenCalledWith('/api/suggestions/assets/' + 'a'.repeat(64) + '.png', { headers: { Authorization: 'Bearer jwt-placeholder' } })
  })
})

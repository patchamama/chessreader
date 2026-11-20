import { httpClient } from '../../shared/api/httpClient'
import { useAuthStore } from '../auth/store/authStore'
import { bookSlug } from '../library/errata/errataFormat'

/**
 * A book's stored EPUB on the server: writing the accepted suggestions into it
 * (admin), its backups and undo (admin), downloading it (owner or admin), its
 * images (to pick a cover) and uploading a suggestion image.
 */

export interface ApplyResult {
  applied: string[]
  stale: string[]
  /** The backup made before writing; null when nothing was written. */
  backup: string | null
}

export interface EpubBackup {
  name: string
  size: number
  createdAt: string
  /** How many suggestions that backed-up file holds. */
  applied: number
}

export interface RestoreResult {
  restored: string
  /** The backup of the EPUB as it was before the restore (to undo it). */
  backup: string
  reverted: string[]
  reapplied: string[]
}

export interface BookImage {
  path: string
  url: string
  cover: boolean
}

export async function applySuggestionsToEpub(bookId: number): Promise<ApplyResult> {
  const r = await httpClient<ApplyResult>(`/api/library/books/${bookId}/apply-suggestions`, { method: 'POST' })
  return { applied: r.applied ?? [], stale: r.stale ?? [], backup: r.backup ?? null }
}

export async function listBackups(bookId: number): Promise<EpubBackup[]> {
  return (await httpClient<{ backups?: EpubBackup[] }>(`/api/library/books/${bookId}/backups`)).backups ?? []
}

export function restoreBackup(bookId: number, backup: string): Promise<RestoreResult> {
  return httpClient<RestoreResult>(`/api/library/books/${bookId}/restore-backup`, { method: 'POST', body: JSON.stringify({ backup }) })
}

export async function listBookImages(bookId: number): Promise<BookImage[]> {
  return (await httpClient<{ images?: BookImage[] }>(`/api/library/books/${bookId}/images`)).images ?? []
}

/** Stores an image for a suggestion (PNG, JPEG or WebP, at most 5 MB); returns its URL. */
export async function uploadSuggestionAsset(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const r = await httpClient<{ url: string }>('/api/suggestions/assets', { method: 'POST', body: form })
  return r.url
}

const ASSET = /^(?:\/api\/)?suggestions\/assets\/([a-f0-9]{64}\.(?:png|jpg|webp))$/

/** Whether a src is an uploaded suggestion image, which only an authenticated request can read. */
export function isProtectedAsset(src: string): boolean {
  return ASSET.test(src.trim())
}

function authHeaders(): Record<string, string> {
  const { token } = useAuthStore.getState()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchOk(url: string): Promise<Response> {
  const r = await fetch(url, { headers: authHeaders() })
  if (!r.ok) {
    let message = `HTTP ${r.status}`
    try {
      const body = (await r.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      // not JSON
    }
    throw new Error(message)
  }
  return r
}

/** An uploaded suggestion image as a blob: URL (an <img> cannot send the token). Revoke it when done. */
export async function authBlobUrl(src: string): Promise<string> {
  const m = ASSET.exec(src.trim())
  if (!m) throw new Error('not a suggestion image')
  const r = await fetchOk(`/api/suggestions/assets/${m[1]}`)
  return URL.createObjectURL(await r.blob())
}

/** Downloads the book's EPUB (with the token) and saves it under the server's file name. */
export async function downloadEpub(bookId: number, title: string): Promise<void> {
  const r = await fetchOk(`/api/library/books/${bookId}/epub`)
  const disposition = r.headers.get('Content-Disposition') ?? ''
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${bookSlug(title) || `book-${bookId}`}.epub`
  const url = URL.createObjectURL(await r.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

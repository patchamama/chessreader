import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EXTERNAL_BOOK_ID, ensureExternalChapters, useExternalBookStore } from '../../../shared/externalBook/externalBookStore'
// Registers how a resources book kept by its id is read again after a refresh.
import '../../errors/repoBooks'
import { httpClient } from '../../../shared/api/httpClient'
import { withChapterErrata, type ChapterErrata } from '../errata/chapterErrata'
import { useErrataContext } from '../errata/errataContext'
import { withChapterSuggestions, type ChapterSuggestions } from '../../suggestions/suggestionsApi'

export interface Book {
  id: number
  title: string
  author: string
  createdAt: string
  description: string
  /** Lowercase 2-letter code ("en", "es"…); '' or missing when unknown. */
  language?: string
}

export interface ChapterTocEntry {
  order: number
  title: string
}

export interface Chapter {
  title: string
  html: string
  toc: ChapterTocEntry[]
  /** The errata of this book and chapter written into `html` (added by useChapter). */
  errata?: ChapterErrata
  /** The accepted suggestions written into `html` and the stale ones (added by useChapter). */
  suggestions?: ChapterSuggestions
}

export function useBooks() {
  return useQuery<Book[]>({
    queryKey: ['library', 'books'],
    queryFn: () => httpClient<Book[]>('/api/library/books'),
  })
}

/** The title of the open book: from the book list, or the in-memory external book's own title. */
export function useBookTitle(bookId: number): string | null {
  const externalTitle = useExternalBookStore((s) => (bookId === EXTERNAL_BOOK_ID ? s.title : null))
  const { data } = useQuery<Book[]>({
    queryKey: ['library', 'books'],
    queryFn: () => httpClient<Book[]>('/api/library/books'),
    enabled: bookId > 0,
  })
  if (bookId === EXTERNAL_BOOK_ID) return externalTitle ?? null
  return data?.find((b) => b.id === bookId)?.title ?? null
}

export function useChapter(bookId: number, chapterOrder: number) {
  // The external book (games opened from the game search) is served from
  // memory; every other book comes from the API, with the errata of the book
  // and chapter (server, else the resources repository) applied to its text.
  const external = useExternalBookStore((s) => (bookId === EXTERNAL_BOOK_ID ? s : null))
  const queryClient = useQueryClient()
  const query = useQuery<Chapter>({
    queryKey: ['library', 'chapter', bookId, chapterOrder, external?.version ?? 0],
    queryFn: async () => {
      if (external) {
        const chapters = external.chapters.length > 0 ? external.chapters : await ensureExternalChapters()
        const chapter = chapters[chapterOrder - 1]
        return chapter ? chapter : Promise.reject(new Error('Chapter not found'))
      }
      const chapter = await httpClient<Chapter>(`/api/library/books/${bookId}/chapters/${chapterOrder}`)
      const title = await bookTitle(queryClient, bookId)
      const { html, errata } = await withChapterErrata(chapter.html, title, chapterOrder)
      // Accepted suggestions not yet written into the EPUB; never blocks reading.
      const suggested = await withChapterSuggestions(html, title, chapterOrder).catch(() => null)
      return suggested
        ? { ...chapter, html: suggested.html, errata, suggestions: suggested.suggestions }
        : { ...chapter, html, errata }
    },
  })
  const setErrataContext = useErrataContext((s) => s.set)
  const errata = query.data?.errata
  const externalTitle = external?.title ?? null
  useEffect(() => {
    setErrataContext({
      bookId, chapter: chapterOrder,
      bookTitle: errata?.bookTitle ?? externalTitle,
      applied: errata?.applied ?? [],
    })
  }, [setErrataContext, bookId, chapterOrder, errata, externalTitle])
  return query
}

/** The title of a book (errata are filed by it), from the cached book list; null when unknown. */
async function bookTitle(queryClient: ReturnType<typeof useQueryClient>, bookId: number): Promise<string | null> {
  try {
    const books = await queryClient.fetchQuery<Book[]>({
      queryKey: ['library', 'books'],
      queryFn: () => httpClient<Book[]>('/api/library/books'),
      staleTime: 60_000,
    })
    return books.find((b) => b.id === bookId)?.title ?? null
  } catch {
    return null
  }
}

export interface UploadInput {
  file?: File
  url?: string
}

export interface UploadResult {
  bookId: number
  status: string
}

export function useUpdateBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title, author, description }: { id: number; title: string; author: string; description: string }) =>
      httpClient<Book>(`/api/library/books/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title, author, description }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library', 'books'] }),
  })
}

export function useDeleteBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      httpClient(`/api/library/books/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library', 'books'] }),
  })
}

export function useTouchBook() {
  return useMutation({
    mutationFn: (bookId: number) =>
      httpClient(`/api/library/books/${bookId}/touch`, { method: 'POST' }),
  })
}

export function useUploadBook() {
  const queryClient = useQueryClient()

  return useMutation<UploadResult, Error, UploadInput>({
    mutationFn: async (input: UploadInput) => {
      if (input.file) {
        const formData = new FormData()
        formData.append('file', input.file)
        // For multipart we skip the default Content-Type header (browser sets boundary)
        return httpClient<UploadResult>('/api/library/upload', {
          method: 'POST',
          headers: {},
          body: formData,
        })
      }
      if (input.url) {
        return httpClient<UploadResult>('/api/library/upload', {
          method: 'POST',
          body: JSON.stringify({ url: input.url }),
        })
      }
      throw new Error('Provide a file or a URL')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'books'] })
    },
  })
}

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EXTERNAL_BOOK_ID, useExternalBookStore } from '../../../shared/externalBook/externalBookStore'
import { httpClient } from '../../../shared/api/httpClient'
import { withChapterErrata, type ChapterErrata } from '../errata/chapterErrata'
import { useErrataContext } from '../errata/errataContext'

export interface Book {
  id: number
  title: string
  author: string
  createdAt: string
  description: string
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
}

export function useBooks() {
  return useQuery<Book[]>({
    queryKey: ['library', 'books'],
    queryFn: () => httpClient<Book[]>('/api/library/books'),
  })
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
        const chapter = external.chapters[chapterOrder - 1]
        return chapter ? chapter : Promise.reject(new Error('Chapter not found'))
      }
      const chapter = await httpClient<Chapter>(`/api/library/books/${bookId}/chapters/${chapterOrder}`)
      const title = await bookTitle(queryClient, bookId)
      const { html, errata } = await withChapterErrata(chapter.html, title, chapterOrder)
      return { ...chapter, html, errata }
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

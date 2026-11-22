import { useQuery } from '@tanstack/react-query'
import { httpClient } from '../../../shared/api/httpClient'
import type { Book } from '../api/libraryApi'

/** The library entry of a book (author, language), from the same cached list the library uses. */
export function useLibraryBook(bookId: number): Book | undefined {
  const { data } = useQuery<Book[]>({
    queryKey: ['library', 'books'],
    queryFn: () => httpClient<Book[]>('/api/library/books'),
    enabled: bookId > 0,
  })
  return data?.find((b) => b.id === bookId)
}

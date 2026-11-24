import { httpClient } from '../../../shared/api/httpClient'
import type { StudyBookPayload } from './buildBook'

export type AddStudyBook = (book: StudyBookPayload, signal?: AbortSignal) => Promise<{ bookId: number }>

/** Send the assembled study book to the API, which writes the EPUB and adds it to the library. */
export const addStudyBook: AddStudyBook = async (book, signal) => {
  const { title, author, language, chapters, images, cover } = book
  return httpClient<{ bookId: number; status: string }>('/api/studies/to-book', {
    method: 'POST', body: JSON.stringify({ title, author, language, chapters, images, cover }), ...(signal ? { signal } : {}),
  })
}

import { http, HttpResponse, delay } from 'msw'
import { MOCK_BOOKS, MOCK_CHAPTERS } from '../mockData'

export const libraryHandlers = [
  http.get('/api/library/books', async () => {
    await delay(300)
    return HttpResponse.json(MOCK_BOOKS)
  }),

  http.get('/api/library/books/:bookId/chapters/:chapterOrder', async ({ params }) => {
    await delay(400)
    const id = Number(params.bookId)
    const chapter = MOCK_CHAPTERS[id]
    if (!chapter) {
      return HttpResponse.json({ error: 'Chapter not found' }, { status: 404 })
    }
    return HttpResponse.json(chapter)
  }),

  http.post('/api/library/upload', async () => {
    await delay(800)
    // Demo: pretend the upload succeeded with a new book id
    return HttpResponse.json({ bookId: 99, status: 'processed' })
  }),
]

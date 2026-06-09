import { http, HttpResponse, delay } from 'msw'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { MOCK_PARSED_WEBPAGE } from '../mockData'

export const webparserHandlers = [
  http.post('/api/webparser/parse', async () => {
    await delay(700)
    // Extract plain text from the mock HTML and run real move recognition.
    const plainText = MOCK_PARSED_WEBPAGE.html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const games = recognizeGames(plainText)

    return HttpResponse.json({ ...MOCK_PARSED_WEBPAGE, games })
  }),
]

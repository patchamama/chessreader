import { http, HttpResponse, delay } from 'msw'

// Demo login always succeeds and returns a fake JWT-shaped token.
// The token payload encodes admin so the header shows the right role.
const DEMO_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.' +
  btoa(JSON.stringify({ sub: 1, email: 'demo@chessreader.app', role: 'admin', status: 'approved' })) +
  '.demo-signature'

export const authHandlers = [
  http.post('/api/auth/login', async () => {
    await delay(400)
    return HttpResponse.json({ token: DEMO_TOKEN })
  }),

  http.post('/api/auth/register', async () => {
    await delay(400)
    return HttpResponse.json({ id: 99, email: 'new@chessreader.app', status: 'pending' })
  }),
]

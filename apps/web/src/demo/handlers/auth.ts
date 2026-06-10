import { http, HttpResponse, delay } from 'msw'

const header = 'eyJhbGciOiJIUzI1NiJ9' // {"alg":"HS256"}
const payload = btoa(
  JSON.stringify({ sub: 1, email: 'demo@chessreader.app', role: 'admin', status: 'approved' }),
)
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '')
const DEMO_TOKEN = `${header}.${payload}.demo-signature`

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

import { http, HttpResponse, delay } from 'msw'
import { MOCK_PENDING_USERS } from '../mockData'

// Mutable in-memory list so approve/reject actually work in the demo.
let pendingUsers = [...MOCK_PENDING_USERS]

export const adminHandlers = [
  http.get('/api/admin/pending-users', async () => {
    await delay(300)
    return HttpResponse.json(pendingUsers)
  }),

  http.post('/api/admin/users/:id/approve', async ({ params }) => {
    await delay(200)
    const id = Number(params.id)
    pendingUsers = pendingUsers.filter((u) => u.id !== id)
    return HttpResponse.json({ ok: true })
  }),

  http.post('/api/admin/users/:id/reject', async ({ params }) => {
    await delay(200)
    const id = Number(params.id)
    pendingUsers = pendingUsers.filter((u) => u.id !== id)
    return HttpResponse.json({ ok: true })
  }),
]

import { http, HttpResponse, delay } from 'msw'
import { MOCK_PENDING_USERS } from '../mockData'

// Mutable in-memory list so approve/reject actually work in the demo.
let pendingUsers = [...MOCK_PENDING_USERS]

// Server engine in the demo: releases as GitHub lists them, installs kept in memory.
const SF_RELEASES = [
  { tag: 'sf_19', name: 'Stockfish 19', publishedAt: '2026-09-05T08:33:17Z', prerelease: false, available: true },
  { tag: 'sf_18', name: 'Stockfish 18', publishedAt: '2026-01-31T14:33:53Z', prerelease: false, available: true },
  { tag: 'sf_17.1', name: 'Stockfish 17.1', publishedAt: '2025-03-30T12:13:16Z', prerelease: false, available: true },
]
const sfState = { installed: ['sf_18'], selected: 'system' }
const sfStatus = () => ({
  latest: SF_RELEASES[0], latestInstalled: sfState.installed.includes(SF_RELEASES[0].tag), releases: SF_RELEASES,
  installed: sfState.installed, selected: sfState.selected, system: '/usr/games/stockfish',
})

export const adminHandlers = [
  http.get('/api/admin/engine/stockfish', async () => {
    await delay(200)
    return HttpResponse.json(sfStatus())
  }),

  http.post('/api/admin/engine/stockfish/install', async ({ request }) => {
    await delay(1200)
    const { tag } = (await request.json()) as { tag: string }
    if (!SF_RELEASES.some((r) => r.tag === tag)) return HttpResponse.json({ error: `Unknown Stockfish release: ${tag}` }, { status: 400 })
    if (!sfState.installed.includes(tag)) sfState.installed = [tag, ...sfState.installed].sort().reverse()
    return HttpResponse.json(sfStatus())
  }),

  http.put('/api/admin/engine/stockfish/selected', async ({ request }) => {
    await delay(200)
    const { tag } = (await request.json()) as { tag: string }
    sfState.selected = tag
    return HttpResponse.json(sfStatus())
  }),

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

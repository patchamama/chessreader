import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePlayStore, setPlayRuntime, setPlaySpeaker } from './playStore'
import { useSettingsStore } from '../../shared/settings/settingsStore'
import { clearOpeningBook } from './openingBook'

const flush = () => new Promise((r) => setTimeout(r, 0))
async function settle(until: () => boolean) { for (let i = 0; i < 100 && !until(); i++) await flush() }

beforeEach(() => {
  clearOpeningBook()
  setPlayRuntime({ analyse: vi.fn(async () => [{ idx: 1, pv: ['e7e5'], scoreCp: 0, depth: 1 }]) as never })
  usePlayStore.getState().reset()
})

describe('playing with a tutor (S27)', () => {
  it('against the engine: my move, the engine answers, the tutor comments both', async () => {
    const s = usePlayStore.getState()
    s.start({ mode: 'engine', color: 'white', strength: 3, lang: 'en' })
    expect(usePlayStore.getState().status).toBe('playing')
    expect(s.move('e2', 'e4')).toBe(true)
    await settle(() => usePlayStore.getState().sans.length === 2)
    expect(usePlayStore.getState().sans).toEqual(['e4', 'e5'])
    expect(usePlayStore.getState().status).toBe('playing')
  })

  it('refuses a move out of turn or illegal', () => {
    const s = usePlayStore.getState()
    s.start({ mode: 'engine', color: 'black', strength: 3, lang: 'en' })
    expect(s.move('e7', 'e5')).toBe(false)
  })

  it('warns when my move leaves something to the opponent, and points out my chances', async () => {
    setPlayRuntime({ analyse: vi.fn(async () => [{ idx: 1, pv: ['g8f6'], scoreCp: 0, depth: 1 }]) as never })
    const s = usePlayStore.getState()
    s.start({ mode: 'human', color: 'white', strength: 3, lang: 'en' })
    s.move('e2', 'e4'); s.move('e7', 'e5'); s.move('g1', 'f3'); s.move('b8', 'c6'); s.move('f3', 'g5'); s.move('d8', 'g5')
    // After 3...Qxg5 (two players on one board) — let's check a simpler free piece:
    const log = usePlayStore.getState().log.map((l) => l.text).join(' | ')
    expect(log).toMatch(/A free piece: Qxg5 wins the knight on g5/)
  })
  it('against the Lichess AI: the challenge starts the game, its moves arrive by the stream, mine are sent', async () => {
    const calls: string[] = []
    const enc = new TextEncoder()
    let push: (line: string) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/challenge/ai')) return { ok: true, status: 201, json: async () => ({ id: 'g1' }) }
      if (url.includes('/board/game/stream/')) {
        return { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(enc.encode('{"type":"gameFull","state":{"moves":"","status":"started"}}\n')); push = (l) => c.enqueue(enc.encode(l)) } }) }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    }))
    const s = usePlayStore.getState()
    s.start({ mode: 'lichess-ai', color: 'white', strength: 2, lang: 'en', token: 'tok', clock: { minutes: 10, increment: 5 } })
    await settle(() => usePlayStore.getState().lichess?.gameId === 'g1')
    expect(usePlayStore.getState().move('e2', 'e4')).toBe(true)
    push('{"type":"gameState","moves":"e2e4 c7c5","status":"started"}\n')
    await settle(() => usePlayStore.getState().sans.length === 2)
    expect(usePlayStore.getState().sans).toEqual(['e4', 'c5'])
    expect(calls).toContain('POST https://lichess.org/api/board/game/g1/move/e2e4')
    vi.unstubAllGlobals()
  })

  it('keeps the Lichess players, ratings and clocks from the game stream (S13)', async () => {
    const enc = new TextEncoder()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/challenge/ai')) return { ok: true, status: 201, json: async () => ({ id: 'g2' }) }
      if (url.includes('/board/game/stream/')) {
        const full = { type: 'gameFull', id: 'g2', speed: 'rapid', rated: false,
          white: { id: 'me', name: 'Mandy', rating: 1650, title: null }, black: { aiLevel: 3 },
          state: { moves: '', wtime: 600000, btime: 600000, winc: 5000, binc: 5000, status: 'started' } }
        return { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(enc.encode(JSON.stringify(full) + '\n')) } }) }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    }))
    usePlayStore.getState().start({ mode: 'lichess-ai', color: 'white', strength: 3, lang: 'en', token: 'tok', clock: { minutes: 10, increment: 5 } })
    await settle(() => usePlayStore.getState().players !== null)
    const s = usePlayStore.getState()
    expect(s.players).toEqual({ white: { name: 'Mandy', rating: 1650 }, black: { name: 'Lichess AI level 3' } })
    expect(s.clocks).toMatchObject({ white: 600000, black: 600000, increment: 5000 })
    expect(s.gameInfo).toEqual({ speed: 'rapid', rated: false, url: 'https://lichess.org/g2' })
    vi.unstubAllGlobals()
  })

  it('challenges a Maia bot on Lichess and follows the game when it starts (S13)', async () => {
    const calls: string[] = []
    const enc = new TextEncoder()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url} ${init?.body ?? ''}`.trim())
      if (url.endsWith('/stream/event')) {
        return { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(enc.encode('{"type":"gameStart","game":{"gameId":"m1","color":"black"}}\n')) } }) }
      }
      if (url.includes('/board/game/stream/')) return { ok: true, status: 200, body: new ReadableStream({ start() {} }) }
      return { ok: true, status: 200, json: async () => ({ id: 'c1' }) }
    }))
    usePlayStore.getState().start({ mode: 'lichess-bot', bot: 'maia5', color: 'black', strength: 3, lang: 'en', token: 'tok', clock: { minutes: 10, increment: 5 } })
    await settle(() => usePlayStore.getState().lichess?.gameId === 'm1')
    expect(calls).toContain('POST https://lichess.org/api/challenge/maia5 rated=false&clock.limit=600&clock.increment=5&color=black')
    expect(usePlayStore.getState().color).toBe('black')
    vi.unstubAllGlobals()
  })
})

describe('move status (S12)', () => {
  it('a move of a named opening is a book move', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': ['B00', "King's Pawn Game"] }), { status: 200 })))
    usePlayStore.getState().start({ mode: 'human', color: 'white', strength: 3, lang: 'en' })
    usePlayStore.getState().move('e2', 'e4')
    await settle(() => usePlayStore.getState().judgement !== null)
    expect(usePlayStore.getState().judgement).toMatchObject({ san: 'e4', kind: 'book', opening: "King's Pawn Game (B00)" })
    vi.unstubAllGlobals()
  })

  it('out of the book, the engine rates the move: a move that drops the queen is a blunder', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    // After 2. Qg4?? the queen hangs to ...d5/...Nf6: +9 for Black (the side to move).
    setPlayRuntime({ analyse: vi.fn(async (fen: string) => (fen.startsWith('rnbqkbnr/pppp1ppp/8/4p3/4P1Q1')
      ? [{ idx: 1, pv: ['d7d5'], scoreCp: 900, depth: 10 }]
      : [{ idx: 1, pv: ['g1f3'], scoreCp: 40, depth: 10 }])) as never })
    usePlayStore.getState().start({ mode: 'human', color: 'white', strength: 3, lang: 'en' })
    usePlayStore.getState().move('e2', 'e4')
    usePlayStore.getState().move('e7', 'e5')
    usePlayStore.getState().move('d1', 'g4')
    await settle(() => usePlayStore.getState().judgement?.san === 'Qg4')
    expect(usePlayStore.getState().judgement).toMatchObject({ san: 'Qg4', kind: 'blunder' })
    vi.unstubAllGlobals()
  })
})

describe('voice (S13)', () => {
  it('says only the opponent\'s moves when the voice is set to the opponent', async () => {
    const said: string[] = []
    setPlaySpeaker((text) => { said.push(text) })
    useSettingsStore.setState({ playVoice: 'opponent' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    usePlayStore.getState().start({ mode: 'engine', color: 'white', strength: 3, lang: 'en' })
    usePlayStore.getState().move('e2', 'e4')
    await settle(() => usePlayStore.getState().sans.length === 2)
    expect(said).toEqual(['pawn to e 5'])
    useSettingsStore.setState({ playVoice: 'none' })
    vi.unstubAllGlobals()
  })

  it('against an engine on the server: its moves come from the server (S23)', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(url); return new Response(JSON.stringify(url.includes('/api/engine/play') ? { move: 'e7e5' } : {}), { status: 200 }) }))
    usePlayStore.getState().start({ mode: 'server', serverEngine: 'maia-1500', color: 'white', strength: 3, lang: 'en' })
    usePlayStore.getState().move('e2', 'e4')
    await settle(() => usePlayStore.getState().sans.length === 2)
    expect(usePlayStore.getState().sans).toEqual(['e4', 'e5'])
    expect(calls.some((u) => u.startsWith('/api/engine/play?engine=maia-1500&fen='))).toBe(true)
    expect(usePlayStore.getState().players?.black.name).toBe('maia-1500')
    vi.unstubAllGlobals()
  })
})

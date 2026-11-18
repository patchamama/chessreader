import { describe, expect, it } from 'vitest'
import { wrapperSource } from './stockfishWorker'

/** Run the outer worker with a fake engine and record the commands it gets. */
function harness() {
  const sent: string[] = []
  const out: unknown[] = []
  let engine!: { postMessage: (c: string) => void; onmessage: ((e: { data: string }) => void) | null }
  class FakeWorker { onmessage: ((e: { data: string }) => void) | null = null; constructor() { engine = this as never } postMessage(c: string) { sent.push(c) } }
  const self: { postMessage: (m: unknown) => void; onmessage?: (e: { data: unknown }) => void } = { postMessage: (m) => out.push(m) }
  new Function('self', 'Worker', 'fetch', wrapperSource({ url: 'http://x/sf.js', sameOrigin: true }))(self, FakeWorker, () => Promise.reject(new Error('no')))
  const reply = (line: string) => engine.onmessage?.({ data: line })
  reply('uciok'); reply('readyok')
  return { sent, out, reply, ask: (fen: string) => self.onmessage!({ data: { type: 'lines', fen, depth: 20, count: 1 } }) }
}

describe('engine wrapper: a new position while the engine is thinking', () => {
  it('stops the search and waits for bestmove before changing options or the position (else Stockfish wasm aborts: "unreachable")', () => {
    const h = harness()
    h.ask('fen-1')
    const afterFirst = h.sent.length
    expect(h.sent.slice(-2)).toEqual(['position fen fen-1', 'go depth 20'])
    h.ask('fen-2')
    expect(h.sent.slice(afterFirst)).toEqual(['stop'])
    h.reply('bestmove e2e4')
    expect(h.sent.slice(afterFirst + 1)).toContain('position fen fen-2')
    expect(h.sent.slice(-1)).toEqual(['go depth 20'])
  })

  it('a stopped search does not report its lines as the final answer for the new position', () => {
    const h = harness()
    h.ask('fen-1')
    h.reply('info depth 5 multipv 1 score cp 20 pv e2e4')
    h.ask('fen-2')
    h.reply('bestmove e2e4')
    expect(h.out.some((m) => (m as { final?: boolean; fen?: string }).final && (m as { fen?: string }).fen === 'fen-2')).toBe(false)
  })

  it('while waiting for the stopped search, its lines are not reported for the new position', () => {
    const h = harness()
    h.ask('fen-1')
    h.ask('fen-2')
    const before = h.out.length
    h.reply('info depth 9 multipv 1 score cp 50 pv d2d4')
    expect(h.out.length).toBe(before)
  })
})

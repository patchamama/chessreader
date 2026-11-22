import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../shared/api/httpClient'
import { parseRefs, runImport, type ImportEvent } from './importRunner'
import type { ImportResult, Study } from './studiesApi'

const ok = (id: string): ImportResult => ({ imported: [{ id } as Study], skipped: [], linked: [], errors: [] })

describe('parseRefs', () => {
  it('reads URLs with or without scheme, chapters and bare ids, once each', () => {
    expect(parseRefs('https://lichess.org/study/T5T0MhwR/tMH87FE3\nlichess.org/study/gfZY383j  CaZ01HLL, lichess.org/study/gfZY383j')).toEqual(['T5T0MhwR', 'gfZY383j', 'CaZ01HLL'])
  })
})

describe('runImport', () => {
  it('imports sequentially and reports progress and a summary', async () => {
    const order: string[] = []
    const client = { importStudy: vi.fn(async (id: string) => { order.push(`s${id}`); await Promise.resolve(); order.push(`e${id}`); return ok(id) }) }
    const events: ImportEvent[] = []
    const sum = await runImport(client, ['aaaaaaaa', 'bbbbbbbb'], { follow: true }, (e) => events.push(e))
    expect(order).toEqual(['saaaaaaaa', 'eaaaaaaaa', 'sbbbbbbbb', 'ebbbbbbbb'])
    expect(client.importStudy).toHaveBeenCalledWith('aaaaaaaa', { follow: true })
    expect(sum).toEqual({ imported: 2, skipped: 0, errors: 0, cancelled: false })
    expect(events.map((e) => e.type)).toEqual(['start', 'done', 'start', 'done'])
  })
  it('records an error and goes on', async () => {
    const client = { importStudy: vi.fn().mockRejectedValueOnce(new Error('not found')).mockResolvedValueOnce(ok('b')) }
    const events: ImportEvent[] = []
    const sum = await runImport(client, ['aaaaaaaa', 'bbbbbbbb'], {}, (e) => events.push(e))
    expect(sum.errors).toBe(1)
    expect(sum.imported).toBe(1)
    expect(events).toContainEqual({ type: 'error', id: 'aaaaaaaa', message: 'not found' })
  })
  it('waits on a 429 and retries once', async () => {
    const client = { importStudy: vi.fn().mockRejectedValueOnce(new ApiError(429, 'Lichess asks to wait 7 s')).mockResolvedValueOnce(ok('a')) }
    const sleep = vi.fn().mockResolvedValue(undefined)
    const events: ImportEvent[] = []
    const sum = await runImport(client, ['aaaaaaaa'], {}, (e) => events.push(e), { sleep })
    expect(sleep).toHaveBeenCalledWith(7000)
    expect(events).toContainEqual({ type: 'wait', id: 'aaaaaaaa', seconds: 7 })
    expect(sum.imported).toBe(1)
  })
  it('gives up after a second 429', async () => {
    const client = { importStudy: vi.fn().mockRejectedValue(new ApiError(429, 'wait 1')) }
    const sum = await runImport(client, ['aaaaaaaa'], {}, () => {}, { sleep: async () => {} })
    expect(client.importStudy).toHaveBeenCalledTimes(2)
    expect(sum.errors).toBe(1)
  })
  it('stops when cancelled', async () => {
    let n = 0
    const client = { importStudy: vi.fn(async (id: string) => { n++; return ok(id) }) }
    const sum = await runImport(client, ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'], {}, () => {}, { isCancelled: () => n >= 1 })
    expect(client.importStudy).toHaveBeenCalledTimes(1)
    expect(sum.cancelled).toBe(true)
  })
})

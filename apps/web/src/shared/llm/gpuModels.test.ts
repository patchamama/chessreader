import { describe, expect, it } from 'vitest'
import { formatLoadedModel, ollamaRootOf, parseLoadedModels, unloadHint } from './gpuModels'

const GB = 1e9
const NOW = Date.parse('2026-01-01T00:00:00Z')

describe('ollamaRootOf', () => {
  it('drops /v1 and trailing slashes', () => {
    expect(ollamaRootOf('http://localhost:11434/v1')).toBe('http://localhost:11434')
    expect(ollamaRootOf(' http://localhost:11434/v1/ ')).toBe('http://localhost:11434')
    expect(ollamaRootOf('http://host:1/')).toBe('http://host:1')
    expect(ollamaRootOf('')).toBe('')
  })
})

describe('parseLoadedModels', () => {
  it('reads the models of /api/ps and ignores malformed data', () => {
    const body = { models: [{ name: 'a:1', size: 10, size_vram: 5, expires_at: 'x' }, { nope: 1 }, null] }
    expect(parseLoadedModels(body)).toEqual([{ name: 'a:1', size: 10, sizeVram: 5, expiresAt: 'x' }])
    expect(parseLoadedModels(null)).toEqual([])
    expect(parseLoadedModels({ models: 3 })).toEqual([])
  })
})

describe('formatLoadedModel', () => {
  it('fully in VRAM: GPU', () => {
    expect(formatLoadedModel({ name: 'gpt-oss:20b', size: 12.7 * GB, sizeVram: 12.7 * GB })).toBe('GPU · gpt-oss:20b · 12.7 GB')
  })
  it('partly in VRAM: percentage', () => {
    expect(formatLoadedModel({ name: 'm', size: 10 * GB, sizeVram: 8 * GB })).toBe('GPU 80% · m · 8.0 GB')
  })
  it('no VRAM: CPU with the model size', () => {
    expect(formatLoadedModel({ name: 'm', size: 4 * GB, sizeVram: 0 })).toBe('CPU · m · 4.0 GB')
  })
})

describe('unloadHint', () => {
  it('says when it unloads, or that it stays', () => {
    expect(unloadHint('2026-01-01T00:04:00Z', NOW)).toBe('Unloads in 4 min')
    expect(unloadHint('2026-01-01T00:00:30Z', NOW)).toBe('Unloads in under a minute')
    expect(unloadHint('2318-01-01T00:00:00Z', NOW)).toBe('Stays loaded')
    expect(unloadHint('2025-12-31T00:00:00Z', NOW)).toBe('Unloading')
    expect(unloadHint(undefined, NOW)).toBe('')
  })
})

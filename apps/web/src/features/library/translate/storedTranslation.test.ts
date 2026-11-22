import { describe, it, expect } from 'vitest'
import { bookGameId, pgnToTranslatedText, sha1Hex } from './storedTranslation'

describe('sha1Hex', () => {
  it('matches the known SHA-1 vectors (also for non-ASCII text, as PHP sha1 sees the UTF-8 bytes)', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
    expect(sha1Hex('The quick brown fox jumps over the lazy dog')).toBe('2fd4e1c67a2d28fced849ee1bb76e7391b93eb12')
  })
})

describe('bookGameId', () => {
  it('is "b" and the first 12 hex of sha1(title|chapter|pgn): the id the server gives the game', () => {
    expect(bookGameId('abc', 0, '')).toBe(`b${sha1Hex('abc|0|').slice(0, 12)}`)
    expect(bookGameId('Study', 3, '1. e4 *')).toBe(`b${sha1Hex('Study|3|1. e4 *').slice(0, 12)}`)
  })
})

describe('pgnToTranslatedText', () => {
  it('turns the stored PGN back into the lines of the text, counting the comments before the first move', () => {
    const pgn = '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/R6K w - - 0 1"]\n\n{ El poder de la torre, } 1. Ra7 Kg8 { que confina al rey. } 2. Kg2 Kf8 3. Kf3 *'
    expect(pgnToTranslatedText(pgn)).toEqual({
      text: 'El poder de la torre,\n1. Ra7 Kg8\nque confina al rey.\n2. Kg2 Kf8 3. Kf3 *',
      leading: 1,
    })
  })

  it('has no leading comments when the game opens with its moves', () => {
    expect(pgnToTranslatedText('1. e4 { Un peón. } e5 *')).toEqual({ text: '1. e4\nUn peón.\ne5 *', leading: 0 })
  })
})

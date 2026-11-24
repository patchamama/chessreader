import { describe, expect, it } from 'vitest'
import { recognizeGames } from '@chess-ebook/chess-shared'
import { buildGamePgn, cleanComment, gamesOfText, escapeTag } from './gamePgn'

const TEXT = 'Chapter One\n\nAlpha Rook - Beta Knight, Test Open 1950\n\n1. e4 e5 This is a quiet start. 2. Nf3 Nc6 (2... d6 3. d4 is the old way) 3. Bb5 a6 and White keeps the pressure. 1-0\n\nSecond Text\n\nGamma - Delta\n\n1. d4 d5 2. c4 *'
const book = { title: 'Invented Endings', author: 'A. Writer' }

describe('cleanComment', () => {
  it('drops braces, parentheses, diagram marks, trailing move numbers and the result', () => {
    expect(cleanComment('} { ( a quiet start. 2... ￼')).toBe('a quiet start.')
    expect(cleanComment(' and that is all. 1-0')).toBe('and that is all.')
    expect(cleanComment('  ')).toBe('')
  })
})

describe('escapeTag', () => {
  it('keeps a header value on one line without quotes or backslashes', () => {
    expect(escapeTag('He said "hi"\\\nthere')).toBe("He said 'hi' there")
  })
})

describe('buildGamePgn', () => {
  const games = recognizeGames(TEXT)
  const first = buildGamePgn(games[0], TEXT, { book, chapter: 3, chapterTitle: 'Quiet games', gameIndex: 0 })

  it('reads the players, the date and the result from the heading and the text', () => {
    expect(first.white).toBe('Alpha Rook')
    expect(first.black).toBe('Beta Knight')
    expect(first.result).toBe('1-0')
    expect(first.pgn).toContain('[White "Alpha Rook"]')
    expect(first.pgn).toContain('[Black "Beta Knight"]')
    expect(first.pgn).toContain('[Date "1950.??.??"]')
    expect(first.pgn).toContain('[Result "1-0"]')
  })

  it('records the book, author and chapter as the source and as the event when none is read', () => {
    expect(first.pgn).toContain('[Source "Invented Endings, A. Writer, chapter 3: Quiet games"]')
    expect(first.event).toBe('Quiet games')
    expect(first.pgn).toContain('[Event "Quiet games"]')
    expect(first.pgn).toContain('[Site "?"]')
  })

  it('writes the book prose between the moves as {comments}, variations included', () => {
    expect(first.pgn).toContain('2. e4 e5 {This is a quiet start.}'.replace('2. ', '1. '))
    expect(first.pgn).toContain('{and White keeps the pressure.}')
    expect(first.pgn).toMatch(/\(2\.\.\. d6 3\. d4 \{is the old way\}\)/)
    expect(first.pgn.trim().endsWith('1-0')).toBe(true)
  })

  it('uses "?" and * when the heading and result are not read', () => {
    const second = buildGamePgn(games[1], TEXT, { book, chapter: 3, chapterTitle: '', gameIndex: 1 }, games[0].charEnd)
    expect(second.white).toBe('Gamma')
    expect(second.black).toBe('Delta')
    expect(second.result).toBe('*')
    expect(second.pgn).toContain('[Date "????.??.??"]')
    expect(second.pgn).toContain('[Event "Invented Endings"]')
    expect(second.pgn.trim().endsWith('2. c4 *')).toBe(true)
  })

  it('never lets a book text break the PGN: no stray braces inside a comment', () => {
    const text = '1. e4 e5 { a } { b } nice move } 2. Nf3 *'
    const [g] = recognizeGames(text)
    const out = buildGamePgn(g, text, { book, chapter: 1, chapterTitle: '', gameIndex: 0 })
    const comments = [...out.pgn.matchAll(/\{([^}]*)\}/g)].map((m) => m[1])
    expect(comments.join(' ')).toContain('a b nice move')
    expect(out.pgn.replace(/\{[^}]*\}/g, '')).not.toMatch(/[{}]/)
  })

  it('keeps the position when the game does not start from the initial one', () => {
    const text = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1\n\n1. e4 Kd7 2. e5 *'
    const [g] = recognizeGames(text)
    const out = buildGamePgn(g, text, { book, chapter: 1, chapterTitle: '', gameIndex: 0 })
    expect(out.pgn).toContain('[SetUp "1"]')
    expect(out.pgn).toContain('[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]')
  })
})

describe('gamesOfText', () => {
  it('keeps the games that have moves, in order', () => {
    const out = gamesOfText(TEXT, { book, chapter: 1, chapterTitle: 'T' })
    expect(out.map((g) => g.gameIndex)).toEqual([0, 1])
    expect(out.map((g) => g.white)).toEqual(['Alpha Rook', 'Gamma'])
  })
})

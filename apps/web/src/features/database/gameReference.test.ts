import { describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ demo: false }))
vi.mock('../../shared/env/devMode', () => ({ isDemoHost: () => env.demo, isDevMode: () => false, isLocalhostHost: () => true }))

import { gameChapterTitle, gameReferenceHeading, gameSourceFooter, lichessUrl, openInBookHref, withGameReference } from './gameReference'

const book = { id: 'mgp-1', title: 'Mis geniales predecesores I', author: 'Garry Kasparov' }
const game = { id: 'mgp-1-6', white: 'P. Saint-Amant', black: 'H. Staunton', year: 1843, chapter: 4, gameIndex: 6 }

describe('game reference (S6: a name and an id to quote the game)', () => {
  it('the chapter title names the book and the database id; the heading also names the game', () => {
    expect(gameChapterTitle(game, { book, lichess: false })).toBe('Mis geniales predecesores I · #mgp-1-6')
    expect(gameChapterTitle({ ...game, id: 'li-1' }, { book: null, lichess: true })).toBe('Lichess · #li-1')
    expect(gameChapterTitle(game, { book: null, lichess: false })).toBe('#mgp-1-6')
    const heading = gameReferenceHeading(game, { book, lichess: false })
    expect(heading).toContain('<h2 data-no-recognition>P. Saint-Amant – H. Staunton (1843) · Mis geniales predecesores I</h2>')
    // The id alone, selected with one click, outside the recognition.
    expect(heading).toMatch(/<p class="game-reference" data-no-recognition>Database id: <code class="select-all[^"]*"[^>]*>mgp-1-6<\/code><\/p>/)
  })

  it('escapes the names', () => {
    expect(gameReferenceHeading({ ...game, white: 'A <b>', black: 'B & C' }, { book: null, lichess: false })).toContain('A &lt;b&gt; – B &amp; C')
  })
})

describe('game source (S8: author and book at the end, with a link to the game in the book)', () => {
  it('a book game: author, book and a link that opens the game in the book', () => {
    const html = gameSourceFooter(game, { book, lichess: false })
    expect(html).toMatch(/^<p class="game-source" data-no-recognition>/)
    expect(html).toContain('Source: Garry Kasparov, <cite>Mis geniales predecesores I</cite>')
    expect(html).toContain('<a class="open-game-in-book" href="/database?openBook=mgp-1&amp;chapter=4&amp;game=6" data-book="mgp-1" data-chapter="4" data-game="6">Open this game in the book</a>')
  })

  it('a book game without a known chapter, or a book not in the resources, has no link', () => {
    expect(gameSourceFooter({ ...game, chapter: null }, { book, lichess: false })).not.toContain('open-game-in-book')
    const unknown = gameSourceFooter(game, { book: null, lichess: false, bookId: 'other-book' })
    expect(unknown).toContain('Source: other-book')
    expect(unknown).not.toContain('<a')
  })

  it('a Lichess game: Lichess, with a link to the game on Lichess when its address is known', () => {
    const html = gameSourceFooter({ ...game, id: 'lichess-AbCd1234' }, { book: null, lichess: true })
    expect(html).toContain('Source: Lichess')
    expect(html).toContain('<a href="https://lichess.org/AbCd1234" target="_blank" rel="noopener noreferrer">the game on Lichess</a>')
    expect(gameSourceFooter({ ...game, id: 'li-x' }, { book: null, lichess: true })).not.toContain('<a')
  })

  it('lichessUrl: from the Site (place) when it is a Lichess address, else from a Lichess game id', () => {
    expect(lichessUrl({ id: 'x', place: 'https://lichess.org/Zz9Zz9Zz' })).toBe('https://lichess.org/Zz9Zz9Zz')
    expect(lichessUrl({ id: 'Zz9Zz9Zz' })).toBe('https://lichess.org/Zz9Zz9Zz')
    expect(lichessUrl({ id: 'li-1', place: 'Moscú' })).toBeNull()
  })

  it('the link works in the deployed app too (hash routes)', () => {
    expect(openInBookHref('mgp-1', 4, null)).toBe('/database?openBook=mgp-1&chapter=4')
    env.demo = true
    expect(openInBookHref('mgp-1', 4, 6)).toBe('#/database?openBook=mgp-1&chapter=4&game=6')
    env.demo = false
  })
})

describe('withGameReference (S6 S8 on the chapter the database opens)', () => {
  it('puts the reference on top and the source at the end of the game chapter', () => {
    const chapter = { title: 'P. Saint-Amant — H. Staunton', html: '<h2>P. Saint-Amant — H. Staunton</h2>\n<p>1. d4 d5 1-0</p>', toc: [{ order: 1, title: 'P. Saint-Amant — H. Staunton' }] }
    const out = withGameReference(chapter, game, { book, lichess: false })
    expect(out.title).toBe('Mis geniales predecesores I · #mgp-1-6')
    expect(out.toc).toEqual([{ order: 1, title: 'Mis geniales predecesores I · #mgp-1-6' }])
    expect(out.html.startsWith('<h2 data-no-recognition>P. Saint-Amant – H. Staunton (1843) · Mis geniales predecesores I</h2>')).toBe(true)
    expect(out.html).not.toContain('<h2>P. Saint-Amant — H. Staunton</h2>')
    expect(out.html).toContain('<p>1. d4 d5 1-0</p>')
    expect(out.html.trimEnd().endsWith('</p>')).toBe(true)
    expect(out.html.indexOf('1. d4 d5')).toBeLessThan(out.html.indexOf('class="game-source"'))
  })
})

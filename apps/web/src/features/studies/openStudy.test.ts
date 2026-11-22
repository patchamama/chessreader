import { describe, expect, it } from 'vitest'
import { buildStudyBook, type StudyPart } from './openStudy'

const game = (name: string, moves: string) => `[Event "Study"]\n[ChapterName "${name}"]\n[Annotator "https://lichess.org/@/someone"]\n\n${moves}`
const pgn = [game('First game', '1. e4 { Comment one. } e5 2. Nf3 *'), game('Second game', '1. d4 d5 { Comment two. } 2. c4 *')].join('\n\n')
const part = (name: string, p = pgn): StudyPart => ({ name, pgn: p })

describe('buildStudyBook', () => {
  it('continuous: one reader chapter holding every game in order, with a heading per game and its comments', () => {
    const b = buildStudyBook([part('My Study')], 'continuous')
    expect(b.title).toBe('My Study')
    expect(b.chapters).toHaveLength(1)
    const html = b.chapters[0].html
    expect(html.indexOf('First game')).toBeGreaterThan(-1)
    expect(html.indexOf('First game')).toBeLessThan(html.indexOf('Second game'))
    expect(html).toContain('<h2>First game</h2>')
    expect(html).toContain('{ Comment one. }')
    expect(html).toContain('{ Comment two. }')
    expect(b.chapters[0].toc).toEqual([{ order: 1, title: 'My Study' }])
  })

  it('per game: one chapter per study chapter, titled by ChapterName, with a table of contents', () => {
    const b = buildStudyBook([part('My Study')], 'per-game')
    expect(b.chapters.map((c) => c.title)).toEqual(['First game', 'Second game'])
    expect(b.chapters[1].html).toContain('{ Comment two. }')
    expect(b.chapters[0].toc.map((t) => t.title)).toEqual(['First game', 'Second game'])
  })

  it('a group in continuous mode keeps the parts in order under part headings', () => {
    const b = buildStudyBook([part('Part 1', game('A', '1. e4 e5 *')), part('Part 2', game('B', '1. d4 d5 *'))], 'continuous', 'The Book')
    expect(b.title).toBe('The Book')
    expect(b.chapters).toHaveLength(1)
    const h = b.chapters[0].html
    expect(h.indexOf('<h1>Part 1</h1>')).toBeLessThan(h.indexOf('<h2>A</h2>'))
    expect(h.indexOf('<h2>A</h2>')).toBeLessThan(h.indexOf('<h1>Part 2</h1>'))
    expect(h.indexOf('<h1>Part 2</h1>')).toBeLessThan(h.indexOf('<h2>B</h2>'))
  })

  it('a group per game prefixes each chapter with its part name', () => {
    const b = buildStudyBook([part('Part 1', game('A', '1. e4 e5 *')), part('Part 2', game('B', '1. d4 d5 *'))], 'per-game', 'The Book')
    expect(b.chapters.map((c) => c.title)).toEqual(['Part 1: A', 'Part 2: B'])
    expect(b.chapters[1].html).toContain('<h2>Part 2: B</h2>')
    expect(b.chapters[0].toc).toHaveLength(2)
  })

  it('throws when there is nothing readable', () => {
    expect(() => buildStudyBook([part('Empty', '')], 'continuous')).toThrow(/no games/i)
  })
})

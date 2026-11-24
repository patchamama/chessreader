import { describe, expect, it, vi } from 'vitest'
import { buildStudyBook, candidateMoves, isIncluded, type BuildOptions } from './buildBook'
import { parseStudyChapters } from './studyChapters'
import type { DiagramEvaluation } from '../../library/diagramEval/diagramEvalStore'

const PGN = `[Event "Invented"]
[ChapterName "Ideas"]

{ Intro text. } 1. e4 { Central pawn. } e5 2. Nf3 $1 { Developing with a threat. } 2... Nc6 3. Bb5? { Not the point. } a6 *

[Event "Invented"]
[ChapterName "Endgame"]
[FEN "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"]

1. Kd2 *`

const base: BuildOptions = {
  title: 'Invented book', author: 'Nobody', language: 'en', translate: false, startDiagrams: true,
  autoGood: false, autoBad: false, engineQuality: false, engineEval: false, diagramStyle: 'book', overrides: {},
}
const fakeEval = vi.fn(async (): Promise<DiagramEvaluation> => ({ engine: 'FakeFish', depth: 9, lines: [{ pv: ['e2e4'], scoreCp: 30 }], at: 0 }))
const deps = () => ({ evaluate: fakeEval, diagramSvg: (fen: string) => `<svg xmlns="http://www.w3.org/2000/svg"><!--${fen}--></svg>` })
const chapters = parseStudyChapters(PGN)

const types = (book: Awaited<ReturnType<typeof buildStudyBook>>, i: number) => book.chapters[i].blocks.map((b) => b.type)

describe('candidateMoves / isIncluded', () => {
  it('lists the commented main-line moves with their quality', () => {
    expect(candidateMoves(chapters).map((c) => [c.id, c.move.san, c.move.mark])).toEqual([['0:1', 'e4', null], ['0:3', 'Nf3', 'good'], ['0:5', 'Bb5', 'bad']])
  })
  it('includes good and bad moves only by their switch, and a manual choice wins', () => {
    const [e4, nf3, bb5] = candidateMoves(chapters)
    expect([e4, nf3, bb5].map((c) => isIncluded(c, base))).toEqual([false, false, false])
    expect([e4, nf3, bb5].map((c) => isIncluded(c, { ...base, autoGood: true }))).toEqual([false, true, false])
    expect([e4, nf3, bb5].map((c) => isIncluded(c, { ...base, autoBad: true }))).toEqual([false, false, true])
    expect(isIncluded(e4, { ...base, overrides: { '0:1': true } })).toBe(true)
    expect(isIncluded(nf3, { ...base, autoGood: true, overrides: { '0:3': false } })).toBe(false)
  })
})

describe('buildStudyBook', () => {
  it('writes a chapter per study chapter with the start diagram, comments and moves as text', async () => {
    const book = await buildStudyBook(chapters, base, deps())
    expect(book.chapters.map((c) => c.title)).toEqual(['Ideas', 'Endgame'])
    expect(types(book, 0)).toEqual(['img', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'])
    expect(book.chapters[0].blocks.filter((b) => b.type === 'p').map((b) => (b as { text: string }).text)).toEqual([
      'Intro text.', '1. e4', 'Central pawn.', '1... e5 2. Nf3!', 'Developing with a threat.', '2... Nc6 3. Bb5?', 'Not the point.', '3... a6',
    ])
    expect(book.chapters[1].blocks[0]).toMatchObject({ type: 'img' })
    expect(types(book, 1)).toEqual(['img', 'p'])
  })

  it('puts an automatic diagram of the position right before the comment after a good move, on the main line only', async () => {
    const book = await buildStudyBook(chapters, { ...base, autoGood: true }, deps())
    const blocks = book.chapters[0].blocks
    const at = blocks.findIndex((b) => b.type === 'p' && b.text === 'Developing with a threat.')
    expect(blocks[at - 1].type).toBe('img')
    const fenAfterNf3 = chapters[0].moves[2].fenAfter
    const name = (blocks[at - 1] as { image: string }).image
    expect(atob(book.images.find((i) => i.name === name)!.data)).toContain(fenAfterNf3)
    // The bad move got none: the block before its comment is moves text.
    const bad = blocks.findIndex((b) => b.type === 'p' && b.text === 'Not the point.')
    expect(blocks[bad - 1].type).toBe('p')
  })

  it('does the same for bad moves with the bad switch, and a checkbox can turn one off', async () => {
    const bad = await buildStudyBook(chapters, { ...base, autoBad: true }, deps())
    const blocks = bad.chapters[0].blocks
    expect(blocks[blocks.findIndex((b) => b.type === 'p' && b.text === 'Not the point.') - 1].type).toBe('img')
    const off = await buildStudyBook(chapters, { ...base, autoBad: true, overrides: { '0:5': false } }, deps())
    expect(off.chapters[0].blocks.filter((b) => b.type === 'img')).toHaveLength(1)
  })

  it('omits the start diagram when asked and for a board with no pieces', async () => {
    const none = await buildStudyBook(chapters, { ...base, startDiagrams: false }, deps())
    expect(none.chapters.flatMap((c) => c.blocks).filter((b) => b.type === 'img')).toHaveLength(0)
    const empty = await buildStudyBook(parseStudyChapters('[Event "x"]\n[FEN "8/8/8/8/8/8/8/8 w - - 0 1"]\n\n{ Only text here. } *'), base, deps())
    expect(types(empty, 0)).toEqual(['p'])
  })

  it('writes the engine evaluation under each diagram when asked, and none otherwise', async () => {
    fakeEval.mockClear()
    const withEval = await buildStudyBook(chapters, { ...base, engineEval: true }, deps())
    expect(types(withEval, 1)).toEqual(['img', 'note', 'p'])
    expect((withEval.chapters[1].blocks[1] as { text: string }).text).toContain('FakeFish')
    expect(fakeEval).toHaveBeenCalledTimes(2)
    fakeEval.mockClear()
    await buildStudyBook(chapters, base, deps())
    expect(fakeEval).not.toHaveBeenCalled()
  })

  it('keeps going without the evaluation when the engine fails, and says so', async () => {
    const book = await buildStudyBook(chapters, { ...base, engineEval: true }, { ...deps(), evaluate: async () => { throw new Error('no engine') } })
    expect(types(book, 1)).toEqual(['img', 'p'])
    expect(book.warnings.join(' ')).toContain('no engine')
  })

  it('uses the engine to find good and bad moves the author did not mark', async () => {
    const evaluate = async (fen: string): Promise<DiagramEvaluation> => {
      const afterE4 = fen.startsWith('rnbqkbnr/pppp1ppp') || fen.includes('4P3') // not used: decided below by side to move
      void afterE4
      return fen.split(' ')[1] === 'w'
        ? { engine: 'F', depth: 1, lines: [{ pv: ['e2e4'], scoreCp: 300 }, { pv: ['a2a3'], scoreCp: 0 }], at: 0 }
        : { engine: 'F', depth: 1, lines: [{ pv: ['e7e5'], scoreCp: -300 }], at: 0 }
    }
    const book = await buildStudyBook(chapters, { ...base, autoGood: true, engineQuality: true }, { ...deps(), evaluate })
    const blocks = book.chapters[0].blocks
    const at = blocks.findIndex((b) => b.type === 'p' && b.text === 'Central pawn.')
    expect(blocks[at - 1].type).toBe('img')
  })

  it('translates comments and chapter titles with the per-comment prompt, falling back to the original', async () => {
    const complete = vi.fn(async (req: { messages: { text: string }[] }) => {
      const text = req.messages[0].text
      if (text.includes('Central pawn.')) return { text: '{"text": "Peón central."}' }
      if (text.includes('Ideas')) return { text: '{"text": "Ideas"}' }
      throw new Error('model down')
    })
    const progress: [number, number][] = []
    const book = await buildStudyBook(chapters, { ...base, translate: true, language: 'es' }, { ...deps(), complete: complete as never }, { onProgress: (d, t) => progress.push([d, t]) })
    const texts = book.chapters[0].blocks.filter((b) => b.type === 'p').map((b) => (b as { text: string }).text)
    expect(texts).toContain('Peón central.')
    expect(texts).toContain('Intro text.')
    expect(book.language).toBe('es')
    expect(book.warnings.length).toBeGreaterThan(0)
    expect(progress.at(-1)![0]).toBe(progress.at(-1)![1])
  })

  it('stops when cancelled', async () => {
    const c = new AbortController()
    c.abort()
    await expect(buildStudyBook(chapters, { ...base, engineEval: true }, deps(), { signal: c.signal })).rejects.toThrow(/cancel/i)
  })

  it('shares one image between the same position', async () => {
    const book = await buildStudyBook(parseStudyChapters(PGN + '\n\n' + PGN), base, deps())
    expect(book.images.length).toBe(2)
  })

  it('shows variations after their move', async () => {
    const book = await buildStudyBook(parseStudyChapters('[Event "x"]\n\n1. e4 e5 2. Nf3 (2. f4 { Gambit. } exf4) 2... Nc6 *'), base, deps())
    const texts = book.chapters[0].blocks.filter((b) => b.type === 'p').map((b) => (b as { text: string }).text)
    expect(texts.join(' ')).toContain('2. Nf3 (2. f4 Gambit. exf4)')
  })
})

// scripts/harvest-lichess.mjs: quality filter on invented PGN and the polite
// sequential harvest with a mocked fetch (no network).
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanGamePgn, countPlies, filterGame, harvest, humanCommentText, humanComments, splitPgnGames } from './harvest-lichess.mjs'

const STUDY_ID = 'abcdEFGH'
const COMMENTED = `[Event "Invented study: The open file"]
[Site "https://lichess.org/study/${STUDY_ID}/chap0001"]
[White "?"]
[Black "?"]
[Result "*"]
[Annotator "https://lichess.org/@/inventedcoach"]
[StudyName "Invented study"]
[ChapterName "The open file"]
[ChapterURL "https://lichess.org/study/${STUDY_ID}/chap0001"]

1. e4 { [%clk 1:30:00] } e5 { [%eval 0.25] } 2. Nf3 Nc6 3. Bb5 { The Spanish: the bishop presses on the knight that defends e5. } a6
4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 { [%eval 0.3] [%clk 1:20:00] }
9... Nb8 { Breyer's idea: the knight goes to d7 to free the c-pawn. } 10. d4 Nbd7
11. Nbd2 Bb7 12. Bc2 Re8 { Mistake. Nf1 was best. } 13. Nf1 Bf8 { The rook supports e5 and the bishop guards the king, a solid set-up. } *
`
const CLOCKS_ONLY = `[Event "Invented study: Clocks"]
[Site "https://lichess.org/study/${STUDY_ID}/chap0002"]
[Annotator "https://lichess.org/@/inventedcoach"]
[ChapterName "Clocks"]

1. d4 { [%clk 0:10:00] } d5 { [%clk 0:10:00] } 2. c4 { [%eval 0.1] } e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1 c6 8. Bd3 dxc4 9. Bxc4 Nd5 10. Bxe7 Qxe7 { Inaccuracy. Nxc3 was best. } *
`
const SHORT = `[Event "Invented study: Short"]
[Site "https://lichess.org/study/${STUDY_ID}/chap0003"]
[ChapterName "Short"]

1. e4 { The king's pawn opens lines for the queen and the bishop. } e5 { Black claims the centre at once. } 2. Qh5 { An early queen sortie, easy to chase. } *
`
const STUDY_PGN = [COMMENTED, CLOCKS_ONLY, SHORT].join('\n\n')
const OPTS = { minComments: 2, minPlies: 10, minCommentChars: 15 }

describe('quality filter', () => {
  it('splits a multi-chapter export into games', () => {
    expect(splitPgnGames(STUDY_PGN)).toHaveLength(3)
  })

  it('counts only human comments: no clocks, evals or engine-only annotations', () => {
    expect(humanComments(COMMENTED)).toEqual([
      'The Spanish: the bishop presses on the knight that defends e5.',
      "Breyer's idea: the knight goes to d7 to free the c-pawn.",
      'The rook supports e5 and the bishop guards the king, a solid set-up.',
    ])
    expect(humanComments(CLOCKS_ONLY)).toEqual([])
  })

  it('counts plies of the main line, not of variations or comments', () => {
    expect(countPlies('1. e4 { a (1. d4) comment } e5 (1... c5 2. Nf3) 2. Nf3 $1 Nc6 1-0')).toBe(4)
  })

  it('removes clock/eval commands and engine-only comments from the PGN, keeping human text', () => {
    const pgn = cleanGamePgn(COMMENTED)
    expect(pgn).not.toMatch(/\[%/)
    expect(pgn).not.toContain('Nf1 was best')
    expect(pgn).not.toMatch(/\{\s*\}/)
    expect(pgn).toContain('{ The Spanish: the bishop presses on the knight that defends e5. }')
    expect(pgn).toContain('[ChapterName "The open file"]')
  })

  it('keeps a commented game and drops clock-only and too short ones, with the reason', () => {
    expect(filterGame(COMMENTED, OPTS)).toMatchObject({ keep: true, comments: 3, plies: 26 })
    expect(filterGame(CLOCKS_ONLY, OPTS)).toMatchObject({ keep: false, reason: 'comments 0 < 2' })
    expect(filterGame(SHORT, OPTS)).toMatchObject({ keep: false, reason: 'plies 3 < 10' })
  })
})

describe('harvest', () => {
  let out
  afterEach(() => { if (out) rmSync(out, { recursive: true, force: true }) })

  function mockFetch(responses) {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init })
      const next = responses.shift()
      return { ok: next.status === 200, status: next.status, text: async () => next.body ?? '' }
    }
    return { calls, fetchImpl }
  }

  it('fetches sources one at a time politely, waits a minute on 429, writes PGN, attribution and manifest', async () => {
    out = mkdtempSync(join(tmpdir(), 'harvest-'))
    const { calls, fetchImpl } = mockFetch([
      { status: 429 },
      { status: 200, body: STUDY_PGN },
      { status: 200, body: COMMENTED.replace(/abcdEFGH/g, 'zzzzYYYY') },
    ])
    const sleeps = []
    const summary = await harvest(
      { studies: [STUDY_ID], users: ['inventedcoach'], ...OPTS, maxGames: 10, lang: 'en' },
      { out, fetchImpl, sleep: async (ms) => { sleeps.push(ms) }, log: () => {} },
    )

    expect(calls.map((c) => c.url)).toEqual([
      `https://lichess.org/api/study/${STUDY_ID}.pgn?clocks=false&comments=true&variations=true`,
      `https://lichess.org/api/study/${STUDY_ID}.pgn?clocks=false&comments=true&variations=true`,
      'https://lichess.org/api/study/by/inventedcoach/export.pgn?clocks=false&comments=true&variations=true',
    ])
    for (const c of calls) {
      expect(c.init.headers['User-Agent']).toBe('chessreader-harvest (sample data tool)')
      expect(c.init.headers.Accept).toBe('application/x-chess-pgn')
      expect(Object.keys(c.init.headers).map((h) => h.toLowerCase())).not.toContain('authorization')
    }
    expect(sleeps.some((ms) => ms >= 60_000)).toBe(true)

    expect(summary).toMatchObject({ kept: 2, dropped: 2 })
    const pgn = readFileSync(join(out, 'lichess', `study-${STUDY_ID}.pgn`), 'utf8')
    expect(pgn).toContain('[ChapterName "The open file"]')
    expect(pgn).not.toContain('[ChapterName "Clocks"]')
    expect(pgn).not.toMatch(/\[%/)
    expect(existsSync(join(out, 'lichess', 'user-inventedcoach.pgn'))).toBe(true)

    const report = JSON.parse(readFileSync(join(out, 'lichess', 'harvest.json'), 'utf8'))
    expect(report.licence).toMatch(/author/i)
    expect(report.games[0]).toMatchObject({
      source: `study-${STUDY_ID}`, studyId: STUDY_ID, studyUrl: `https://lichess.org/study/${STUDY_ID}`,
      chapter: 'The open file', chapterUrl: `https://lichess.org/study/${STUDY_ID}/chap0001`, author: 'inventedcoach', comments: 3,
    })
    expect(report.dropped).toEqual(expect.arrayContaining([expect.objectContaining({ chapter: 'Clocks', reason: 'comments 0 < 2' })]))

    const manifest = JSON.parse(readFileSync(join(out, 'lichess', 'manifest.json'), 'utf8'))
    expect(manifest[0]).toMatchObject({ file: `study-${STUDY_ID}.pgn`, kind: 'lichess', lang: 'en', author: 'inventedcoach' })
    expect(manifest[0].title).toContain('Invented study')
  })

  it('stops at maxGames and skips a source that is not found', async () => {
    out = mkdtempSync(join(tmpdir(), 'harvest-'))
    const { calls, fetchImpl } = mockFetch([{ status: 404 }, { status: 200, body: STUDY_PGN }])
    const summary = await harvest(
      { studies: ['missing1', STUDY_ID], ...OPTS, minPlies: 1, maxGames: 1 },
      { out, fetchImpl, sleep: async () => {}, log: () => {} },
    )
    expect(calls).toHaveLength(2)
    expect(summary.kept).toBe(1)
    const report = JSON.parse(readFileSync(join(out, 'lichess', 'harvest.json'), 'utf8'))
    expect(report.games).toHaveLength(1)
    expect(report.sources.find((s) => s.source === 'study-missing1')).toMatchObject({ error: 'HTTP 404' })
  })
})

describe('humanCommentText', () => {
  it('removes clock, eval, arrow and square commands and leaves nothing for engine-only notes', () => {
    expect(humanCommentText(' [%clk 1:30:00] The knight [%cal Gb5c6][%csl Re5] heads for d5. [%eval 0.3] ')).toBe('The knight heads for d5.')
    expect(humanCommentText('Mistake. Nf1 was best.')).toBe('')
    expect(humanCommentText('[%eval 0.25]')).toBe('')
  })
})

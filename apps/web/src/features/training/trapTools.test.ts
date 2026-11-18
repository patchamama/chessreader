import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { filterTraps, loadTraps, type Trap } from './traps'
import { figurinesOn, localSan, wrongMoveText } from './trapNotation'
import { ideaSegments } from './trapText'
import { firstMoves, trapContinuations } from './trapExplorer'
import { capturedPieces } from './captured'
import { cachedJson } from './offline'
import { levelPuzzle } from './levelPuzzles'

vi.mock('../library/commentdb/commentLookup', () => ({ resourcesConfigured: () => false, getJson: vi.fn() }))
vi.mock('../../shared/api/serverSession', () => ({ hasServerSession: () => false }))

const line = (moves: string) => { const c = new Chess(); const keys = [positionHash(c.fen())]; const sans = moves.split(' ').map((m) => { const r = c.move(m); keys.push(positionHash(c.fen())); return r.san }); return { sans, keys } }
const base = { category: 'Classic traps', trapMove: 3, setup: 3, fall: 3, tactic: 2, themes: [], intro: '', source: { title: 'x', author: null } }
const scholar: Trap = { ...base, id: 's', title: "Scholar's mate", opening: 'Italian Game', side: 'white', fall: 4, ...line('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#') }
const blackburne: Trap = { ...base, id: 'b', title: 'Blackburne', opening: 'Italian Game', side: 'black', ...line('e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5') }
const elephant: Trap = { ...base, id: 'e', title: 'Elephant trap', opening: "Queen's Gambit Declined", side: 'black', ...line('d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5') }

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('trap notation in the language of the settings (S13)', () => {
  it('writes a move with the piece letters of the language, or with figurines', () => {
    expect(localSan('Ne7', 'es', false)).toBe('Ce7')
    expect(localSan('Bc4', 'de', false)).toBe('Lc4')
    expect(localSan('Qxf7#', 'en', false)).toBe('Qxf7#')
    expect(localSan('Ne7', 'es', true)).toBe('♞e7')
  })
  it('a wrong move says which move it was, in the language', () => {
    expect(wrongMoveText('es', 'Ce7')).toBe('No es la jugada de la celada. Era Ce7.')
    expect(wrongMoveText('en', 'Bc4')).toBe("Not the trap's move. It was Bc4.")
  })
  it('reads a figurine setting tolerantly (the setting may not exist yet)', () => {
    expect(figurinesOn({})).toBe(false)
    expect(figurinesOn({ figurines: true })).toBe(true)
    expect(figurinesOn({ notationStyle: 'figurine' })).toBe(true)
    expect(figurinesOn({ notationStyle: 'letters' })).toBe(false)
  })
})

describe('the idea text of a trap: its moves, squares and lines (S13)', () => {
  it('finds the moves (replayable from the trap line), the squares and the diagonals named in the text', () => {
    const segs = ideaSegments('Las blancas amenazan 3. Dh5 con ataque a f7; la diagonal a2-g8.', scholar, 'es')
    expect(segs.map((s) => s.kind)).toEqual(['text', 'line', 'text', 'square', 'text', 'square', 'text'])
    const mv = segs[1]
    expect(mv.kind === 'line' && mv.positions.map((p) => p.san)).toEqual(['Qh5'])
    const at = new Chess(); ['e4', 'e5', 'Bc4', 'Nc6'].forEach((m) => at.move(m))
    expect(mv.kind === 'line' && mv.startFen).toBe(at.fen())
    expect(segs[3]).toMatchObject({ kind: 'square', text: 'f7', squares: ['f7'] })
    expect(segs[5]).toMatchObject({ kind: 'square', text: 'a2-g8', squares: ['a2', 'b3', 'c4', 'd5', 'e6', 'f7', 'g8'] })
  })
  it('keeps text whose moves cannot be played as plain text', () => {
    expect(ideaSegments('Nothing here.', scholar, 'en')).toEqual([{ kind: 'text', text: 'Nothing here.' }])
  })
})

describe('exploring traps by first move and from a position (S13)', () => {
  it('lists the first moves of the traps and filters by one', () => {
    expect(firstMoves([scholar, blackburne, elephant])).toEqual(['e4', 'd4'])
    expect(filterTraps([scholar, blackburne, elephant], { firstMove: 'd4' }).map((t) => t.id)).toEqual(['e'])
  })
  it('gives the moves that keep traps reachable from a position, with their traps', () => {
    const c = new Chess(); c.move('e4'); c.move('e5')
    const next = trapContinuations(c.fen(), [scholar, blackburne, elephant])
    expect(next.map((n) => [n.san, n.traps.map((t) => t.id)])).toEqual([['Bc4', ['s']], ['Nf3', ['b']]])
  })
})

describe('captured pieces (S13)', () => {
  it('lists, per side, the pieces it has taken', () => {
    const c = new Chess(); 'e4 d5 exd5 Qxd5 Nc3 Qxa2'.split(' ').forEach((m) => c.move(m))
    expect(capturedPieces(c.fen())).toEqual({ white: ['p'], black: ['P', 'P'] })
  })
})

describe('offline training data (S13)', () => {
  it('serves the last copy of bundled data when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([scholar]), { status: 200 })))
    expect((await loadTraps()).map((t) => t.id)).toEqual(['s'])
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect((await loadTraps()).map((t) => t.id)).toEqual(['s'])
  })
  it('cachedJson throws only when there is neither network nor copy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(cachedJson('/nothing.json')).rejects.toThrow()
  })
  it('the level test reads its puzzles from bundled data, near the rating', async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify([
      ['a', '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1', 'g8f8 a1a8', 900, 'backRankMate'],
      ['b', '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1', 'g8f8 a1a8', 2400, 'backRankMate'],
    ]), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const p = await levelPuzzle(1000, () => 0)
    expect(p.id).toBe('a')
    expect(p.solution).toEqual(['a1a8'])
    expect(String(fetch.mock.calls[0][0])).toMatch(/training\/level\.json$/)
    expect(String(fetch.mock.calls[0][0])).not.toMatch(/lichess/)
  })
})

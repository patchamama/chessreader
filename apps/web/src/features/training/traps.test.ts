import { beforeEach, describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { dueTraps, filterTraps, recordPractice, trapsAt, type Trap } from './traps'

const line = (moves: string) => { const c = new Chess(); const keys = [positionHash(c.fen())]; const sans = moves.split(' ').map((m) => { const r = c.move(m); keys.push(positionHash(c.fen())); return r.san }); return { sans, keys } }
const blackburne: Trap = { id: 'b', title: 'Blackburne–Shilling gambit', category: 'Bait', opening: 'Italian Game', side: 'black', trapMove: 3, setup: 3, fall: 4, tactic: 2, themes: ['fork'], intro: '', source: { title: 'x', author: null },
  ...line('e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#') }
const elephant: Trap = { ...blackburne, id: 'e', title: 'Elephant trap', opening: "Queen's Gambit Declined", side: 'black', fall: 3, ...line('d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5 Bxd8 Bb4+ Qd2 Bxd2+ Kxd2 Kxd8') }

beforeEach(() => localStorage.clear())

describe('traps (S16)', () => {
  it('finds the traps that can still be set from a position', () => {
    const c = new Chess(); for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']) c.move(m)
    expect(trapsAt(c.fen(), [blackburne, elephant]).map((x) => [x.trap.id, x.ply])).toEqual([['b', 5]])
  })
  it('searches by name, opening or theme, and filters by side and how likely the fall is', () => {
    expect(filterTraps([blackburne, elephant], { q: 'queen' }).map((t) => t.id)).toEqual(['e'])
    expect(filterTraps([blackburne, elephant], { minFall: 4 }).map((t) => t.id)).toEqual(['b'])
    expect(filterTraps([blackburne, elephant], { q: 'fork' }).map((t) => t.id)).toEqual(['b', 'e'])
  })
  it('a clean practice brings the trap back later, a mistake tomorrow', () => {
    const now = Date.UTC(2026, 0, 1)
    expect(recordPractice('b', true, now)).toEqual({ box: 1, due: now + 86_400_000 })
    expect(recordPractice('b', true, now)).toEqual({ box: 2, due: now + 2 * 86_400_000 })
    expect(dueTraps([blackburne, elephant], now + 86_400_000).map((t) => t.id)).toEqual(['e'])
    expect(recordPractice('b', false, now)).toEqual({ box: 0, due: now })
  })
})

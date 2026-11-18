import { describe, it, expect, vi } from 'vitest'
import { findOnlineReference, normaliseBookMoves, proposeSubstitutions } from './onlineLookup'

describe('normaliseBookMoves', () => {
  it('strips !? and !! and converts Spanish letters and castling to English SAN', () => {
    expect(normaliseBookMoves(['e4', 'Cf3', 'Ab5!?', '0-0', 'Dxd4!!', 'Rg7', 'Tb1'])).toEqual(['e4', 'Nf3', 'Bb5', 'O-O', 'Qxd4', 'Kg7', 'Rb1'])
  })
  it('converts German letters', () => {
    expect(normaliseBookMoves(['e4', 'Sf3', 'Lb5', 'Dd1', 'Tb1', 'Kg7'])).toEqual(['e4', 'Nf3', 'Bb5', 'Qd1', 'Rb1', 'Kg7'])
  })
  it('leaves English notation alone', () => {
    expect(normaliseBookMoves(['e4', 'Nf3', 'Bb5', 'Rb1+', 'Kg7'])).toEqual(['e4', 'Nf3', 'Bb5', 'Rb1+', 'Kg7'])
  })
})

describe('proposeSubstitutions', () => {
  const printed = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb4!?', 'a6', 'Ba4', 'Nf6']
  const reference = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']
  it('proposes only the moves that differ, ply by ply', () => {
    expect(proposeSubstitutions(printed, reference)).toEqual([{ ply: 5, from: 'Bb4!?', to: 'Bb5' }])
  })
  it('says it is another game when too many moves differ', () => {
    expect(proposeSubstitutions(printed, ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7'])).toBeNull()
  })
})

const PRINTED = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb4!?', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Nb8', 'd4', 'Nbd7', 'c4', 'c6']
const REFERENCE_PGN = '[White "Kasparov, Garry"]\n[Black "Karpov, Anatoly"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 1/2-1/2'

function fakeFetch(answers: Record<string, unknown>) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    void _init
    const url = String(input)
    const key = Object.keys(answers).find((k) => url.includes(k))
    if (!key) return new Response('{"white":0,"draws":0,"black":0,"topGames":[]}', { status: 200 })
    const body = answers[key]
    if (typeof body === 'number') return new Response('', { status: body })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 })
  })
}

describe('findOnlineReference', () => {
  it('finds the game in the Lichess masters database (past the misprint) and proposes the substitution', async () => {
    const fetchFn = fakeFetch({
      '/masters/pgn/abc12345': REFERENCE_PGN,
      '/masters?': { white: 0, draws: 1, black: 0, topGames: [{ id: 'abc12345', white: { name: 'Kasparov, Garry' }, black: { name: 'Karpov, Anatoly' }, year: 1985 }] },
    })
    const r = await findOnlineReference({ printed: PRINTED, white: 'G. Kasparov', black: 'A. Karpov' }, { fetch: fetchFn as unknown as typeof fetch, token: 'tok' })
    expect(r.status).toBe('found')
    if (r.status !== 'found') return
    expect(r.changes).toEqual([{ ply: 5, from: 'Bb4!?', to: 'Bb5' }])
    expect(r.url).toBe('https://lichess.org/import/master/abc12345/white')
    expect(r.white).toBe('Kasparov, Garry')
    const first = fetchFn.mock.calls[0]
    // The misprint was bridged: the query plays Bb5 (f1b5) and continues with the rest of the game.
    expect(String(first[0])).toContain('f1b5,a7a6')
    expect((first[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('does not take a game of other players', async () => {
    const fetchFn = fakeFetch({
      '/masters?': { white: 1, draws: 0, black: 0, topGames: [{ id: 'zzz', white: { name: 'Carlsen, Magnus' }, black: { name: 'Anand, Viswanathan' }, year: 2014 }] },
    })
    const r = await findOnlineReference({ printed: PRINTED, white: 'G. Kasparov', black: 'A. Karpov' }, { fetch: fetchFn as unknown as typeof fetch, token: 'tok' })
    expect(r.status).toBe('not-found')
  })

  it('says honestly that old games are usually not in the masters database', async () => {
    const r = await findOnlineReference({ printed: PRINTED, white: 'E. Lasker', black: 'W. Steinitz', year: 1894 }, { fetch: fakeFetch({}) as unknown as typeof fetch, token: 'tok' })
    expect(r).toMatchObject({ status: 'not-found' })
    if (r.status === 'not-found') expect(r.reason).toMatch(/1894.*before 1952|before 1952/)
  })

  it('asks for a Lichess token when the explorer answers 401', async () => {
    const r = await findOnlineReference({ printed: PRINTED, white: 'G. Kasparov', black: 'A. Karpov' }, { fetch: fakeFetch({ '/masters?': 401 }) as unknown as typeof fetch })
    expect(r.status).toBe('needs-token')
  })
})

// scripts/errata.mjs: errata entries of a resources repository applied to the main line of a book's games.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

// Needs the built library (pnpm build): errata.mjs imports ../dist/index.js.
const built = existsSync(new URL('../dist/index.js', import.meta.url))
const errata = built ? await import('./errata.mjs') : null

// The Opera game as a Spanish book prints it, with a wrong 9th move ("9 Af4!?" for 9 Ag5).
const CHAPTER = [
  'Partida 1',
  'P. Morphy – Duque de Brunswick y Conde Isouard',
  '1 e4 e5 2 Cf3 d6 3 d4 Ag4 4 dxe5 Axf3 5 Dxf3 dxe5 6 Ac4 Cf6 7 Db3 De7 8 Cc3 c6 9 Af4!? b5 10 Cxb5 cxb5 11 Axb5+ Cbd7 12 O-O-O Td8',
  'Las negras están atadas de pies y manos y el blanco abre todas las líneas contra el rey.',
].join('\n')

const ENTRY = {
  id: 'opera-1-0', book: { title: 'Partidas de Ópera' }, chapter: 1, gameIndex: 0,
  game: { label: 'Partida 1', white: 'P. Morphy', black: 'Duque de Brunswick', number: 1 },
  original: { moves: ['e4', 'e5', 'Cf3', 'd6', 'd4', 'Ag4', 'dxe5', 'Axf3', 'Dxf3', 'dxe5', 'Ac4', 'Cf6', 'Db3', 'De7', 'Cc3', 'c6', 'Af4!?'], text: '9 Af4!?' },
  corrected: { moves: ['e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5', 'Bc4', 'Nf6', 'Qb3', 'Qe7', 'Nc3', 'c6', 'Bg5'] },
  changes: [{ ply: 17, from: 'Af4!?', to: 'Bg5', source: 'online' }],
  createdAt: '2026-11-18T10:00:00Z', appVersion: '0.106.6',
}

const dirs = []
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

describe.skipIf(!built)('errata', () => {
  it('names a book folder as the app and the server do', () => {
    expect(errata.bookSlug('Mis geniales predecesores. Volumen I')).toBe('mis-geniales-predecesores-volumen-i')
    expect(errata.bookSlug('El ajedrez de torneo (Zúrich 1953)')).toBe('el-ajedrez-de-torneo-zurich-1953')
  })

  it('loads the entries listed in errata/index.json, by book slug and chapter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'errata-'))
    dirs.push(dir)
    mkdirSync(join(dir, 'partidas-de-opera'))
    writeFileSync(join(dir, 'partidas-de-opera', '1-0.json'), JSON.stringify(ENTRY))
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ version: 1, entries: [{ book: 'partidas-de-opera', chapter: 1, gameIndex: 0, path: 'partidas-de-opera/1-0.json' }] }))
    const loaded = errata.loadErrata(dir)
    expect(errata.errataFor(loaded, { title: 'Partidas de Ópera' }, 1)).toEqual([ENTRY])
    expect(errata.errataFor(loaded, { title: 'Partidas de Ópera' }, 2)).toEqual([])
    expect(errata.errataFor(loaded, { title: 'Otro libro', id: 'partidas-de-opera' }, 1)).toEqual([ENTRY])
  })

  it('an absent errata folder gives no entries', () => {
    expect(errata.errataFor(errata.loadErrata(join(tmpdir(), 'no-such-errata-dir')), { title: 'X' }, 1)).toEqual([])
  })

  it('writes the corrected move in the main line, the printed one and its marks gone', () => {
    const { spanishToEnglish } = errata.lib
    const text = spanishToEnglish(CHAPTER)
    const out = errata.applyErrata(text, [ENTRY], { lang: 'es' })
    expect(out.applied).toBe(1)
    expect(out.text).toContain('8 Nc3 c6 9 Bg5 b5 10 Nxb5')
    expect(out.text).not.toContain('Bf4')
    // Everything else, prose included, is as written.
    expect(out.text.replace('Bg5', 'Bf4!?')).toBe(text)
  })

  it('a change whose printed move is not in the game is skipped', () => {
    const { spanishToEnglish } = errata.lib
    const wrong = { ...ENTRY, changes: [{ ply: 17, from: 'Ae3', to: 'Bg5', source: 'manual' }] }
    const out = errata.applyErrata(spanishToEnglish(CHAPTER), [wrong], { lang: 'es' })
    expect(out.applied).toBe(0)
  })

  it('finds the game by its first printed moves when the index moved', () => {
    const { spanishToEnglish } = errata.lib
    const moved = { ...ENTRY, gameIndex: 3 }
    expect(errata.applyErrata(spanishToEnglish(CHAPTER), [moved], { lang: 'es' }).applied).toBe(1)
  })
})

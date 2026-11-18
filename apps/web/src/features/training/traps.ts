import { positionHash } from '@chess-ebook/chess-shared'
import { hasServerSession } from '../../shared/api/serverSession'
import { httpClient } from '../../shared/api/httpClient'
import { getJson, resourcesConfigured } from '../library/commentdb/commentLookup'

/** A trap (celada): the line that sets it, who sets it, and how likely and hard it is. */
export interface Trap {
  id: string
  title: string
  titleEs?: string
  category: string
  opening: string
  /** The side that sets the trap. */
  side: 'white' | 'black'
  /** The move number where the trap is set. */
  trapMove: number | null
  /** 1–5: how often it can be set up, how likely the opponent falls, how hard it is to carry out. */
  setup: number | null
  fall: number | null
  tactic: number | null
  themes: string[]
  intro: string
  introEs?: string
  sans: string[]
  /** Position hash before each move and after the last (keys[i] = before sans[i]). */
  keys: string[]
  source: { title: string; author: string | null }
}

/**
 * The traps: a public set of classic traps shipped with the app, plus — with
 * a server, or the private resources repository set in Settings — the traps of
 * the books (Lococo's book has 164, each rated as the book rates it).
 */
export async function loadTraps(): Promise<Trap[]> {
  const classic = await fetch(`${import.meta.env.BASE_URL ?? '/'}traps/classic.json`).then((r) => (r.ok ? r.json() : []), () => []) as Trap[]
  let books: Trap[] = []
  try {
    if (hasServerSession()) books = await httpClient<Trap[]>('/api/resources/traps', { method: 'GET' })
    else if (resourcesConfigured()) books = await getJson<Trap[]>('traps.json')
  } catch {
    books = []
  }
  return [...classic, ...books]
}

export interface TrapFilter { q?: string; category?: string; side?: 'white' | 'black' | ''; minFall?: number }

export function filterTraps(traps: Trap[], f: TrapFilter): Trap[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return traps.filter((t) =>
    (!q || [t.title, t.titleEs ?? '', t.opening, ...t.themes].some((x) => x.toLowerCase().includes(q)))
    && (!f.category || t.category === f.category)
    && (!f.side || t.side === f.side)
    && (!f.minFall || (t.fall ?? 0) >= f.minFall))
}

/**
 * The traps that can still be set from this position: the position is on the
 * trap's line before its last move, and the trap is not over yet.
 */
export function trapsAt(fen: string, traps: Trap[]): { trap: Trap; ply: number }[] {
  const hash = positionHash(fen)
  const out: { trap: Trap; ply: number }[] = []
  for (const trap of traps) {
    const ply = trap.keys.indexOf(hash)
    if (ply >= 0 && ply < trap.sans.length - 1) out.push({ trap, ply })
  }
  return out.sort((a, b) => (b.trap.fall ?? 0) - (a.trap.fall ?? 0))
}

// ── Spaced repetition: a trap comes back after 1, 2, 4, 8, 16 days ──────────

const KEY = 'chessreader-trap-progress'
export interface TrapProgress { box: number; due: number }

export function trapProgress(): Record<string, TrapProgress> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}

/** Record a practice: a clean run moves the trap up a box, a mistake back to the first. */
export function recordPractice(id: string, clean: boolean, now = Date.now()): TrapProgress {
  const all = trapProgress()
  const box = clean ? Math.min(5, (all[id]?.box ?? 0) + 1) : 0
  const next = { box, due: now + (clean ? 2 ** (box - 1) : 0) * 86_400_000 }
  try { localStorage.setItem(KEY, JSON.stringify({ ...all, [id]: next })) } catch { /* not kept */ }
  return next
}

/** Traps due for practice now (never practised, or their day has come). */
export function dueTraps(traps: Trap[], now = Date.now()): Trap[] {
  const p = trapProgress()
  return traps.filter((t) => !p[t.id] || p[t.id].due <= now)
}

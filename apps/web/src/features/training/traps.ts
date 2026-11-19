import { Chess } from 'chess.js'
import { positionHash } from '@chess-ebook/chess-shared'
import { hasServerSession } from '../../shared/api/serverSession'
import { httpClient } from '../../shared/api/httpClient'
import { getJson, resourcesConfigured } from '../library/commentdb/commentLookup'
import { bundled, cachedJson } from './offline'

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
  /** Where the trap is in its book, when the trap data says it (file, anchor, chapter). */
  /** Where the trap is in its book (resources text numbering), to open the book there. */
  ref?: { bookId?: string; file?: string; anchor?: string; chapter?: number | string }
}

/** A trap taken from Lococo's book (the private resources). */
export const isBookTrap = (t: Trap) => t.id.startsWith('lococo-') || /Lococo/i.test(t.source.author ?? '')

/**
 * The traps: a public set of classic traps shipped with the app, plus — with
 * a server, or the private resources repository set in Settings — the traps of
 * the books (Lococo's book has 164, each rated as the book rates it).
 */
export async function loadTraps(): Promise<Trap[]> {
  // Bundled and book traps are kept for offline use: the last copy is served without network.
  const classic = await cachedJson<Trap[]>(bundled('traps/classic.json')).catch(() => [] as Trap[])
  let books: Trap[] = []
  try {
    if (hasServerSession()) books = await cachedJson('training:book-traps', () => httpClient<Trap[]>('/api/resources/traps', { method: 'GET' }))
    else if (resourcesConfigured()) books = await cachedJson('training:book-traps', () => getJson<Trap[]>('traps.json'))
  } catch {
    books = []
  }
  return [...classic, ...books]
}

export interface TrapFilter { q?: string; category?: string; side?: 'white' | 'black' | ''; minFall?: number; firstMove?: string }

export function filterTraps(traps: Trap[], f: TrapFilter): Trap[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return traps.filter((t) =>
    (!q || [t.title, t.titleEs ?? '', t.opening, ...t.themes].some((x) => x.toLowerCase().includes(q)))
    && (!f.category || t.category === f.category)
    && (!f.side || t.side === f.side)
    && (!f.minFall || (t.fall ?? 0) >= f.minFall)
    && (!f.firstMove || t.sans[0] === f.firstMove))
}

/** A trap whose line passes through a position, and the ply of that position on the line. */
export interface TrapAt { trap: Trap; ply: number }

const indexes = new WeakMap<Trap[], Map<string, TrapAt[]>>()

/**
 * The traps indexed by position: each position of each trap line (board, side
 * to move, castling, en passant — the trap's `keys`) gives the traps whose line
 * passes through it and the ply there. The order the moves were played in does
 * not matter: any move order reaching the position finds the same traps.
 */
export function trapIndex(traps: Trap[]): Map<string, TrapAt[]> {
  const cached = indexes.get(traps)
  if (cached) return cached
  const index = new Map<string, TrapAt[]>()
  for (const trap of traps) {
    trap.keys.forEach((key, ply) => {
      const list = index.get(key) ?? []
      // A line that comes back to a position keeps its first ply there.
      if (!list.some((e) => e.trap === trap)) index.set(key, [...list, { trap, ply }])
    })
  }
  indexes.set(traps, index)
  return index
}

/**
 * The traps that can still be set from this position: the position is on the
 * trap's line before its last move, and the trap is not over yet.
 */
export function trapsAt(fen: string, traps: Trap[]): TrapAt[] {
  let hash: string
  try { hash = positionHash(fen) } catch { return [] }
  return (trapIndex(traps).get(hash) ?? [])
    .filter(({ trap, ply }) => ply < trap.sans.length - 1)
    .sort((a, b) => (b.trap.fall ?? 0) - (a.trap.fall ?? 0))
}

/** A move from a position that keeps traps on the board. */
export interface TrapContinuation {
  /** The move, in SAN, and its squares. */
  san: string
  from: string
  to: string
  /** `line`: the next move of a trap line through this position; `transposition`: it leads into a position of a trap line. */
  kind: 'line' | 'transposition'
  /** The traps it keeps available, the most likely to fall first. */
  traps: Trap[]
}

/**
 * The moves of the side to move that keep traps on the board, found by
 * position: each legal move whose resulting position is on some trap's line
 * (the next move of a line through this position, a move that completes a
 * trap, or one that enters a line by another move order). Line moves first,
 * then the move with most traps.
 */
export function trapContinuations(fen: string, traps: Trap[]): TrapContinuation[] {
  let chess: Chess
  try { chess = new Chess(fen) } catch { return [] }
  const index = trapIndex(traps)
  const hash = positionHash(fen)
  const here = new Set((index.get(hash) ?? []).map((e) => e.trap))
  const out: TrapContinuation[] = []
  for (const move of chess.moves({ verbose: true })) {
    const reached = (index.get(positionHash(move.after)) ?? []).filter((e) => e.ply > 0)
    if (!reached.length) continue
    // A line move: a trap through this position plays exactly this move next.
    const onLine = reached.filter((e) => here.has(e.trap) && e.trap.keys[e.ply - 1] === hash)
    const kept = [...new Set(reached.map((e) => e.trap))].sort((a, b) => (b.fall ?? 0) - (a.fall ?? 0))
    out.push({ san: move.san, from: move.from, to: move.to, kind: onLine.length ? 'line' : 'transposition', traps: kept })
  }
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'line' ? -1 : 1) || b.traps.length - a.traps.length)
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

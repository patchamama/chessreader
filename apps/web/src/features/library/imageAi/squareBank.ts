import { create } from 'zustand'
import { boardRows, PATCH } from './templateReader'

/**
 * The learning bank of squares (per book): labelled small grey images of the
 * squares of diagrams. It grows from diagrams whose FEN is known and from the
 * user's answers, and the reader (bankReader.ts) compares squares with it.
 * Kept in localStorage per book (capped, oldest first out) and exportable as
 * JSON to share; never written into the repository.
 */
export interface BankEntry {
  /** '.' for an empty square, else the piece letter (KQRBNP white, kqrbnp black). */
  label: string
  /** The square colour: 0 light, 1 dark. */
  colour: 0 | 1
  /** The PATCH x PATCH grey values 0..255 as hex pairs. */
  patch: string
}

export const BANK_CAP = 1500
/** Mean squared difference (values 0..1) under which two squares are the same sample. */
const SAME = 0.0004
const LABELS = new Set('.KQRBNPkqrbnp'.split(''))
const KEY_PREFIX = 'chess-ebook.squareBank.'
const FORMAT = 'chess-ebook-square-bank'

export function encodePatch(p: Float32Array): string {
  let out = ''
  for (let i = 0; i < p.length; i++) out += Math.max(0, Math.min(255, Math.round(p[i] * 255))).toString(16).padStart(2, '0')
  return out
}

export function decodePatch(s: string): Float32Array {
  const out = new Float32Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, (i * 2) + 2), 16) / 255
  return out
}

const decoded = new WeakMap<BankEntry, Float32Array>()
/** The decoded patch of an entry (cached). */
export function patchOf(e: BankEntry): Float32Array {
  let p = decoded.get(e)
  if (!p) { p = decodePatch(e.patch); decoded.set(e, p) }
  return p
}

function sameSample(a: BankEntry, b: BankEntry): boolean {
  if (a.label !== b.label || a.colour !== b.colour) return false
  if (a.patch === b.patch) return true
  const x = patchOf(a), y = patchOf(b)
  let d = 0
  for (let i = 0; i < x.length; i++) { const v = x[i] - y[i]; d += v * v }
  return d / x.length < SAME
}

/** The 64 labelled squares of a diagram whose FEN is known ([] when the FEN has no board). */
export function entriesFromDiagram(patches: Float32Array[], fen: string): BankEntry[] {
  const rows = boardRows(fen)
  if (!rows || patches.length !== 64) return []
  const out: BankEntry[] = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) out.push({ label: rows[r][f], colour: ((r + f) % 2) as 0 | 1, patch: encodePatch(patches[(r * 8) + f]) })
  }
  return out
}

/** The bank plus new entries (near-identical samples skipped); beyond the cap the oldest go first. */
export function addToBank(bank: BankEntry[], add: BankEntry[], cap = BANK_CAP): BankEntry[] {
  const out = [...bank]
  for (const e of add) if (!out.some((o) => sameSample(o, e))) out.push(e)
  return out.length > cap ? out.slice(out.length - cap) : out
}

export function loadBank(bookKey: string): BankEntry[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + bookKey)
    return raw ? parseEntries(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

/** Stores the bank; on a full storage the oldest quarter goes first. false when it cannot be kept. */
export function saveBank(bookKey: string, bank: BankEntry[]): boolean {
  let keep = bank
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      localStorage.setItem(KEY_PREFIX + bookKey, JSON.stringify(keep))
      return true
    } catch {
      keep = keep.slice(Math.ceil(keep.length / 4))
      if (!keep.length) return false
    }
  }
  return false
}

function parseEntries(v: unknown): BankEntry[] {
  if (!Array.isArray(v)) throw new Error('This is not a square bank')
  return v.map((e) => {
    const x = e as Partial<BankEntry>
    if (typeof x.label !== 'string' || !LABELS.has(x.label) || (x.colour !== 0 && x.colour !== 1)
      || typeof x.patch !== 'string' || x.patch.length !== PATCH * PATCH * 2 && x.patch.length !== 4 && !/^[0-9a-f]+$/.test(x.patch)) {
      throw new Error('This is not a square bank')
    }
    return { label: x.label, colour: x.colour, patch: x.patch }
  })
}

export function exportBank(bank: BankEntry[]): string {
  return JSON.stringify({ format: FORMAT, version: 1, entries: bank })
}

/** The entries of an exported bank; throws when the file is not one. */
export function importBank(json: string): BankEntry[] {
  const data = JSON.parse(json) as { format?: string; entries?: unknown }
  if (data?.format !== FORMAT) throw new Error('This is not a square bank')
  return parseEntries(data.entries)
}

interface BankState {
  banks: Record<string, BankEntry[]>
  /** The bank of a book (loaded from the storage the first time). */
  get: (book: string) => BankEntry[]
  add: (book: string, entries: BankEntry[]) => void
  merge: (book: string, entries: BankEntry[]) => void
}

export const useSquareBank = create<BankState>((set, get) => ({
  banks: {},
  get: (book) => {
    const cached = get().banks[book]
    if (cached) return cached
    const loaded = loadBank(book)
    set((s) => ({ banks: { ...s.banks, [book]: loaded } }))
    return loaded
  },
  add: (book, entries) => {
    const next = addToBank(get().get(book), entries)
    saveBank(book, next)
    set((s) => ({ banks: { ...s.banks, [book]: next } }))
  },
  merge: (book, entries) => get().add(book, entries),
}))

import { ApiError } from '../../shared/api/httpClient'
import type { ImportOptions, ImportResult, StudiesClient } from './studiesApi'

/** Study ids from pasted text: URLs (with or without scheme or chapter) and bare 8-char ids; unique, in order. */
export function parseRefs(text: string): string[] {
  const out: string[] = []
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    const m = /(?:lichess\.org\/study\/)([A-Za-z0-9]{8})(?![A-Za-z0-9])/.exec(tok) ?? (/^([A-Za-z0-9]{8})$/.exec(tok))
    if (m && !out.includes(m[1])) out.push(m[1])
  }
  return out
}

export type ImportEvent =
  | { type: 'start'; id: string; index: number; total: number }
  | { type: 'done'; id: string; result: ImportResult }
  | { type: 'error'; id: string; message: string }
  | { type: 'wait'; id: string; seconds: number }

export interface ImportSummary { imported: number; skipped: number; errors: number; cancelled: boolean }

/** Waits in ms; replaceable in tests. */
export interface ImportDeps { sleep?: (ms: number) => Promise<void>; isCancelled?: () => boolean }

const retryAfter = (e: unknown): number | null => {
  if (!(e instanceof ApiError) || e.status !== 429) return null
  const n = /(\d+)/.exec(e.message)
  return n ? Math.min(120, Math.max(1, Number(n[1]))) : 5
}

/** Import the refs one at a time; a 429 waits the asked seconds and retries once. */
export async function runImport(
  client: Pick<StudiesClient, 'importStudy'>, refs: string[], options: ImportOptions,
  onEvent: (e: ImportEvent) => void, deps: ImportDeps = {},
): Promise<ImportSummary> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const sum: ImportSummary = { imported: 0, skipped: 0, errors: 0, cancelled: false }
  for (let i = 0; i < refs.length; i++) {
    if (deps.isCancelled?.()) { sum.cancelled = true; break }
    const id = refs[i]
    onEvent({ type: 'start', id, index: i + 1, total: refs.length })
    let result: ImportResult | null = null
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try { result = await client.importStudy(id, options) } catch (e) {
        const wait = attempt === 0 ? retryAfter(e) : null
        if (wait === null) { sum.errors++; onEvent({ type: 'error', id, message: e instanceof Error ? e.message : String(e) }); break }
        onEvent({ type: 'wait', id, seconds: wait })
        await sleep(wait * 1000)
      }
    }
    if (result) {
      sum.imported += result.imported.length
      sum.skipped += result.skipped.length
      sum.errors += result.errors.length
      onEvent({ type: 'done', id, result })
    }
  }
  return sum
}

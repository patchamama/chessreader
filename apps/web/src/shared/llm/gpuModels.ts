/** A model Ollama currently has loaded (from `GET /api/ps`). */
export interface LoadedModel { name: string; size: number; sizeVram: number; expiresAt?: string }

/** The Ollama root from the LLM base URL (`http://localhost:11434/v1` → `http://localhost:11434`). */
export function ollamaRootOf(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
}

/** The loaded models of an `/api/ps` body; anything malformed is skipped. */
export function parseLoadedModels(body: unknown): LoadedModel[] {
  const list = (body as { models?: unknown } | null)?.models
  if (!Array.isArray(list)) return []
  const out: LoadedModel[] = []
  for (const m of list) {
    if (!m || typeof m !== 'object') continue
    const r = m as Record<string, unknown>
    if (typeof r.name !== 'string' || !r.name) continue
    out.push({
      name: r.name,
      size: typeof r.size === 'number' ? r.size : 0,
      sizeVram: typeof r.size_vram === 'number' ? r.size_vram : 0,
      ...(typeof r.expires_at === 'string' ? { expiresAt: r.expires_at } : {}),
    })
  }
  return out
}

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`

/** `GPU · name · 12.7 GB`; `GPU 80% · …` when only part is in VRAM; `CPU · …` when none is. */
export function formatLoadedModel(m: Pick<LoadedModel, 'name' | 'size' | 'sizeVram'>): string {
  if (m.sizeVram <= 0) return `CPU · ${m.name} · ${gb(m.size)}`
  const share = m.size > 0 && m.sizeVram < m.size ? ` ${Math.round((m.sizeVram / m.size) * 100)}%` : ''
  return `GPU${share} · ${m.name} · ${gb(m.sizeVram)}`
}

const YEAR_MS = 365 * 24 * 3600 * 1000

/** When the model unloads, for a tooltip; empty when unknown. */
export function unloadHint(expiresAt: string | undefined, now: number): string {
  const at = expiresAt ? Date.parse(expiresAt) : NaN
  if (Number.isNaN(at)) return ''
  const left = at - now
  if (left > YEAR_MS) return 'Stays loaded'
  if (left <= 0) return 'Unloading'
  if (left < 60_000) return 'Unloads in under a minute'
  return `Unloads in ${Math.round(left / 60_000)} min`
}

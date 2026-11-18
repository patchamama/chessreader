/**
 * Training data read from the app's bundled files (or the resources) and kept
 * for offline use: every successful read is stored (Cache Storage when the
 * browser has it, else localStorage), and when the network fails the last
 * copy is served. No service worker is needed.
 */
const CACHE = 'chessreader-training-v1'
const PREFIX = 'chessreader-training:'
const memory = new Map<string, unknown>()

async function store(key: string, value: unknown): Promise<void> {
  memory.set(key, value)
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(CACHE)
      await cache.put(key, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }))
      return
    }
  } catch { /* fall back to localStorage */ }
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* not kept */ }
}

async function stored<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T
  try {
    if (typeof caches !== 'undefined') {
      const hit = await (await caches.open(CACHE)).match(key)
      if (hit) return (await hit.json()) as T
    }
  } catch { /* try localStorage */ }
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* none */ }
  return undefined
}

/**
 * JSON from `url` (or from `load`, e.g. the resources API), stored for later;
 * the stored copy when it cannot be read now. Throws only with neither.
 */
export async function cachedJson<T>(url: string, load?: () => Promise<T>): Promise<T> {
  try {
    const value = load
      ? await load()
      : await fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json() as Promise<T> })
    await store(url, value)
    return value
  } catch (e) {
    const copy = await stored<T>(url)
    if (copy !== undefined) return copy
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** Forget the in-memory copies (tests). */
export function resetTrainingMemory(): void { memory.clear() }

/** The URL of a bundled training file. */
export const bundled = (path: string) => `${import.meta.env.BASE_URL ?? '/'}${path}`

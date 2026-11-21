// The Ollama HTTP API: what is loaded, what is installed, pulling a model, and a chat call with its timings.

const ns = (v) => (v ?? 0) / 1e6

/** The models loaded in memory now (Ollama's /api/ps). */
export async function ps(baseUrl, fetchImpl = fetch) {
  const r = await fetchImpl(`${baseUrl}/api/ps`, { signal: AbortSignal.timeout(3000) })
  if (!r.ok) throw new Error(`ollama ${r.status}`)
  const j = await r.json()
  return (j.models ?? []).map((m) => ({
    name: m.name, sizeGb: +(m.size / 1e9).toFixed(1), vramGb: +((m.size_vram ?? 0) / 1e9).toFixed(1),
    params: m.details?.parameter_size ?? null, quant: m.details?.quantization_level ?? null, context: m.context_length ?? null, expires: m.expires_at ?? null,
  }))
}

/** The models installed (Ollama's /api/tags). */
export async function tags(baseUrl, fetchImpl = fetch) {
  const r = await fetchImpl(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
  if (!r.ok) throw new Error(`ollama ${r.status}`)
  const j = await r.json()
  return (j.models ?? []).map((m) => ({ name: m.name, sizeGb: +(m.size / 1e9).toFixed(1), params: m.details?.parameter_size ?? null, quant: m.details?.quantization_level ?? null, modified: m.modified_at ?? null }))
}

/** Downloads a model; `onProgress({ status, completed, total })` for every line Ollama streams. */
export async function pull(baseUrl, model, onProgress = () => {}, { fetchImpl = fetch, signal } = {}) {
  const r = await fetchImpl(`${baseUrl}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: true }), signal })
  if (!r.ok || !r.body) throw new Error(`ollama ${r.status}`)
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of r.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const j = JSON.parse(line)
      if (j.error) throw new Error(j.error)
      onProgress({ status: j.status, completed: j.completed ?? 0, total: j.total ?? 0 })
    }
  }
}

/** The timings Ollama reports for one call, in the units a benchmark wants. */
export function timings(j) {
  const prefillMs = ns(j.prompt_eval_duration), evalMs = ns(j.eval_duration)
  return {
    totalMs: ns(j.total_duration), loadMs: ns(j.load_duration),
    promptTokens: j.prompt_eval_count ?? 0, prefillMs, prefillTokPerS: prefillMs > 0 ? +((j.prompt_eval_count ?? 0) / (prefillMs / 1000)).toFixed(1) : null,
    outputTokens: j.eval_count ?? 0, evalMs, tokPerS: evalMs > 0 ? +((j.eval_count ?? 0) / (evalMs / 1000)).toFixed(1) : null,
  }
}

/** One non-streaming chat call: the answer and its timings. */
export async function chat(baseUrl, { model, system, user, json = false, options = {} }, fetchImpl = fetch) {
  const started = Date.now()
  const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }]
  const r = await fetchImpl(`${baseUrl}/api/chat`, { method: 'POST', body: JSON.stringify({ model, messages, stream: false, ...(json ? { format: 'json' } : {}), options }) })
  if (!r.ok) throw new Error(`ollama ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  return { text: j.message?.content ?? '', metrics: { ...timings(j), wallMs: Date.now() - started } }
}

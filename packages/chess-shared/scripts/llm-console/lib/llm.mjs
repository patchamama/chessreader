// One call interface over the model providers: a local Ollama, OpenAI, Anthropic or any OpenAI-compatible endpoint.
import { chat } from './ollama.mjs'

export const PROVIDERS = ['ollama', 'openai', 'anthropic', 'openai-compatible']

/**
 * complete(cfg, { system, user, json }) → { text, metrics }
 * cfg: { provider, model, baseUrl?, apiKey? }. The key is only ever sent to the provider's own host.
 */
export async function complete(cfg, request, fetchImpl = fetch) {
  const started = Date.now()
  if (!cfg.model) throw new Error('no model set')
  if (cfg.provider === 'ollama') return chat(cfg.baseUrl, { model: cfg.model, ...request }, fetchImpl)
  if (cfg.provider === 'anthropic') {
    const r = await fetchImpl(`${cfg.baseUrl || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey ?? '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: request.maxTokens ?? 4096, ...(request.system ? { system: request.system } : {}), messages: [{ role: 'user', content: request.user }] }),
    })
    const j = await readJson(r)
    return { text: (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(''), metrics: { wallMs: Date.now() - started, promptTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 } }
  }
  if (cfg.provider === 'openai' || cfg.provider === 'openai-compatible') {
    const base = cfg.baseUrl || (cfg.provider === 'openai' ? 'https://api.openai.com/v1' : '')
    if (!base) throw new Error('no base URL set')
    const messages = [...(request.system ? [{ role: 'system', content: request.system }] : []), { role: 'user', content: request.user }]
    const r = await fetchImpl(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey ?? ''}` },
      body: JSON.stringify({ model: cfg.model, messages, ...(request.json ? { response_format: { type: 'json_object' } } : {}) }),
    })
    const j = await readJson(r)
    return { text: j.choices?.[0]?.message?.content ?? '', metrics: { wallMs: Date.now() - started, promptTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 } }
  }
  throw new Error(`unknown provider "${cfg.provider}"`)
}

async function readJson(r) {
  const text = await r.text()
  // The provider's error text is shown, but never anything that could hold the key.
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

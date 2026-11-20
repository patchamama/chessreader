import { httpError, networkError } from './errors'
import { finish } from './shared'
import type { LlmConfig, LlmRequest, LlmResult } from './types'

/** The API root without a trailing slash. */
export function apiRoot(config: LlmConfig): string {
  return config.baseUrl.trim().replace(/\/+$/, '')
}

function headers(config: LlmConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey.trim()) h.Authorization = `Bearer ${config.apiKey.trim()}`
  return h
}

async function call(config: LlmConfig, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw networkError(config.provider, apiRoot(config))
  }
}

async function errorDetail(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } | string } | null
  const e = data?.error
  return typeof e === 'string' ? e : e?.message
}

/** OpenAI chat completions; also Ollama's and any OpenAI-compatible server's. Images go as data URLs. */
export async function completeOpenAi(config: LlmConfig, request: LlmRequest): Promise<LlmResult> {
  const messages: unknown[] = []
  if (request.system) messages.push({ role: 'system', content: request.system })
  for (const m of request.messages) {
    messages.push(m.images?.length
      ? { role: m.role, content: [{ type: 'text', text: m.text }, ...m.images.map((url) => ({ type: 'image_url', image_url: { url } }))] }
      : { role: m.role, content: m.text })
  }
  const body: Record<string, unknown> = { model: config.model.trim(), messages }
  // OpenAI's newer models take only max_completion_tokens; Ollama and compatible servers read max_tokens.
  if (request.maxTokens) body[config.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = request.maxTokens
  if (request.json) body.response_format = { type: 'json_object' }
  const response = await call(config, `${apiRoot(config)}/chat/completions`, { method: 'POST', headers: headers(config), body: JSON.stringify(body) })
  if (!response.ok) throw httpError(config.provider, response.status, await errorDetail(response))
  const data = (await response.json().catch(() => null)) as
    | { model?: string; choices?: { message?: { content?: string | null }; finish_reason?: string }[] }
    | null
  const choice = data?.choices?.[0]
  return finish({ text: choice?.message?.content ?? '', model: data?.model ?? config.model.trim(), stopReason: choice?.finish_reason ?? undefined })
}

/** GET <base>/models; Ollama without its OpenAI endpoint falls back to /api/tags. */
export async function listOpenAiModels(config: LlmConfig): Promise<string[]> {
  const response = await call(config, `${apiRoot(config)}/models`, { method: 'GET', headers: headers(config) })
  if (response.ok) {
    const data = (await response.json().catch(() => null)) as { data?: { id?: string }[] } | null
    return sorted((data?.data ?? []).map((m) => m.id))
  }
  if (config.provider === 'ollama' && response.status === 404) {
    const tags = await call(config, `${apiRoot(config).replace(/\/v1$/, '')}/api/tags`, { method: 'GET' })
    if (!tags.ok) throw httpError(config.provider, tags.status, await errorDetail(tags))
    const data = (await tags.json().catch(() => null)) as { models?: { name?: string }[] } | null
    return sorted((data?.models ?? []).map((m) => m.name))
  }
  throw httpError(config.provider, response.status, await errorDetail(response))
}

function sorted(ids: (string | undefined)[]): string[] {
  return ids.filter((id): id is string => !!id).sort((a, b) => a.localeCompare(b))
}


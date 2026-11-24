import { hasServerSession } from '../api/serverSession'
import { useAuthStore } from '../../features/auth/store/authStore'
import { completeAnthropic, listAnthropicModels } from './anthropicProvider'
import { LlmError, type LlmErrorCode } from './errors'
import { completeOpenAi, listOpenAiModels } from './openAiProvider'
import type { LlmConfig, LlmRequest, LlmResult, LlmTestResult } from './types'

/** The messages of the Settings "Test" button: a plain reply check, then a tiny image the model must name. */
export const TEST_PROMPT = 'Reply with OK and nothing else.'
export const VISION_PROBE_PROMPT = 'What colour is this image? Answer with one word.'

export { LlmError } from './errors'

/**
 * How a call travels: `auto` goes through the app's own server when there is
 * one (no CORS trouble with Ollama or custom endpoints; the key passes with the
 * request and is not kept there), else straight from the browser; `direct`
 * always goes straight to the provider.
 */
export type LlmTransport = 'auto' | 'direct'

/** A 16×16 red square: the vision probe of the Test button. */
export const VISION_PROBE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mO4I2JDEmIY1TCqYfhqAAAeBCwQ81sZJgAAAABJRU5ErkJggg=='

function checkConfig(config: LlmConfig): void {
  if (config.provider === 'anthropic') return
  if (!config.baseUrl.trim()) throw new LlmError('config', 'Set the base URL of the model service in Settings.')
  if (!config.model.trim()) throw new LlmError('config', 'Choose a model in Settings.')
}

function viaServer(transport: LlmTransport): boolean {
  return transport === 'auto' && hasServerSession()
}

async function postToServer<T>(path: string, payload: unknown): Promise<T> {
  const { token } = useAuthStore.getState()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let response: Response
  try {
    response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(payload) })
  } catch {
    throw new LlmError('network', "Could not reach this app's server.")
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string; code?: LlmErrorCode }) | null
  if (!response.ok || !data) {
    throw new LlmError(data?.code ?? 'provider', data?.error ?? `This app's server answered ${response.status}.`, response.status)
  }
  return data
}

/** One answer from the configured model. */
export async function complete(config: LlmConfig, request: LlmRequest, transport: LlmTransport = 'auto'): Promise<LlmResult> {
  checkConfig(config)
  if (viaServer(transport)) return postToServer<LlmResult>('/api/llm/complete', { config, request })
  return config.provider === 'anthropic' ? completeAnthropic(config, request) : completeOpenAi(config, request)
}

/** The model ids the provider offers to this key. */
export async function listModels(config: LlmConfig, transport: LlmTransport = 'auto'): Promise<string[]> {
  if (config.provider !== 'anthropic' && !config.baseUrl.trim()) throw new LlmError('config', 'Set the base URL of the model service in Settings.')
  if (viaServer(transport)) return (await postToServer<{ models: string[] }>('/api/llm/models', { config })).models
  return config.provider === 'anthropic' ? listAnthropicModels(config) : listOpenAiModels(config)
}

/**
 * Whether the model answers: a short "Reply with OK", timed, and (when asked)
 * whether it can see — it is shown a red square and asked for its colour.
 */
export async function testLlm(config: LlmConfig, options: { vision?: boolean; transport?: LlmTransport } = {}): Promise<LlmTestResult> {
  const started = Date.now()
  let result: LlmResult
  try {
    // No token limit: a reasoning model may spend a small one before it answers.
    result = await complete(config, { messages: [{ role: 'user', text: TEST_PROMPT }] }, options.transport)
  } catch (error) {
    return { ok: false, model: config.model, latencyMs: Date.now() - started, vision: null, error: (error as Error).message }
  }
  const latencyMs = Date.now() - started
  let vision: boolean | null = null
  if (options.vision) {
    try {
      const seen = await complete(config, {
        messages: [{ role: 'user', text: VISION_PROBE_PROMPT, images: [VISION_PROBE_PNG] }],
      }, options.transport)
      vision = /red/i.test(seen.text)
    } catch {
      vision = false
    }
  }
  return { ok: true, model: result.model || config.model, latencyMs, vision }
}

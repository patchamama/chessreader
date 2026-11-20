/** The language model services the app can talk to. */
export type LlmProvider = 'anthropic' | 'openai' | 'ollama' | 'openai-compatible'

export const LLM_PROVIDERS: Record<LlmProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  ollama: 'Ollama (local)',
  'openai-compatible': 'Other (OpenAI-compatible API)',
}

/** Where and how to reach a model. The key is the user's own. */
export interface LlmConfig {
  provider: LlmProvider
  /** API root: https://api.openai.com/v1, http://localhost:11434/v1, … (Anthropic: always its own API). */
  baseUrl: string
  apiKey: string
  /** Model id; empty means the provider's default where it has one (Anthropic). */
  model: string
}

export interface LlmMessage {
  role: 'user' | 'assistant'
  text: string
  /** Images as data URLs (data:image/png;base64,…), for models with vision. */
  images?: string[]
}

export interface LlmRequest {
  system?: string
  messages: LlmMessage[]
  /** Ask for a JSON answer; with a schema where the provider supports one. */
  json?: boolean | { schema: Record<string, unknown> }
  maxTokens?: number
}

export interface LlmResult {
  text: string
  model: string
  stopReason?: string
}

export interface LlmTestResult {
  ok: boolean
  model: string
  latencyMs: number
  /** Whether the model read the probe image; null when not probed or the test failed. */
  vision: boolean | null
  error?: string
}

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5'

const BASE_URLS: Record<LlmProvider, string> = {
  anthropic: ANTHROPIC_BASE_URL,
  openai: 'https://api.openai.com/v1',
  ollama: 'http://localhost:11434/v1',
  'openai-compatible': '',
}

/** The base URL Settings prefills for a provider (the user may edit it, except Anthropic's). */
export function defaultBaseUrl(provider: LlmProvider): string {
  return BASE_URLS[provider]
}

/** Whether a provider needs an API key (local Ollama does not; a compatible server may not). */
export function needsKey(provider: LlmProvider): boolean {
  return provider === 'anthropic' || provider === 'openai'
}

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === 'string' && value in BASE_URLS
}

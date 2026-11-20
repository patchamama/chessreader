import { LLM_PROVIDERS, type LlmProvider } from './types'

export type LlmErrorCode = 'config' | 'auth' | 'rate_limit' | 'network' | 'refusal' | 'truncated' | 'empty' | 'provider'

/** A failed model call, with a message a reader can act on. */
export class LlmError extends Error {
  constructor(public readonly code: LlmErrorCode, message: string, public readonly status?: number) {
    super(message)
    this.name = 'LlmError'
  }
}

export function providerName(provider: LlmProvider): string {
  return provider === 'anthropic' ? 'Anthropic' : provider === 'openai-compatible' ? 'the model service' : LLM_PROVIDERS[provider].replace(/ \(.*\)$/, '')
}

/** The readable error for an HTTP answer of a provider (`detail` is the provider's own words). */
export function httpError(provider: LlmProvider, status: number, detail?: string): LlmError {
  const name = providerName(provider)
  const said = detail ? ` ${name === 'the model service' ? 'It' : name} said: ${detail}` : ''
  if (status === 401 || status === 403) return new LlmError('auth', `The API key was not accepted by ${name}.${said}`, status)
  if (status === 429) return new LlmError('rate_limit', `${capitalise(name)} is rate limiting this key: try again in a moment.${said}`, status)
  return new LlmError('provider', detail ? `${capitalise(name)} answered ${status}: ${detail}` : `${capitalise(name)} answered ${status}.`, status)
}

/** The readable error when the provider cannot be reached at all (network, CORS, not running). */
export function networkError(provider: LlmProvider, baseUrl: string): LlmError {
  if (provider === 'ollama') {
    return new LlmError('network',
      `Could not reach Ollama at ${baseUrl}. Check that it is running; if it is, allow this page: start it with ` +
      `OLLAMA_ORIGINS=${pageOrigin()} (or OLLAMA_ORIGINS=*).`)
  }
  return new LlmError('network',
    `Could not reach ${baseUrl || providerName(provider)}: the network failed or the service does not allow calls from this page (CORS).`)
}

function pageOrigin(): string {
  return typeof window === 'undefined' ? '*' : window.location.origin
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

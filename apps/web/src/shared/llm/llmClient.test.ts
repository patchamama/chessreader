import { describe, it, expect, vi, beforeEach } from 'vitest'

const sdk: { options?: Record<string, unknown>; params?: Record<string, unknown>; next: () => Promise<unknown>; models: string[] } = {
  next: async () => ({}),
  models: [],
}

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status: number
    constructor(status = 500, _e?: unknown, message = 'error') { super(message); this.status = status }
  }
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends Error {}
  class Anthropic {
    static APIError = APIError
    static AuthenticationError = AuthenticationError
    static RateLimitError = RateLimitError
    static APIConnectionError = APIConnectionError
    beta = { messages: { stream: (params: Record<string, unknown>) => { sdk.params = params; return { finalMessage: () => sdk.next() } } } }
    models = { list: () => (async function* () { for (const id of sdk.models) yield { id } })() }
    constructor(options: Record<string, unknown>) { sdk.options = options }
  }
  return { default: Anthropic }
})

const session = { server: false }
vi.mock('../api/serverSession', () => ({ hasServerSession: () => session.server }))

import { complete, listModels, testLlm, LlmError, VISION_PROBE_PNG } from './llmClient'
import { defaultBaseUrl, type LlmConfig } from './types'
import { useAuthStore } from '../../features/auth/store/authStore'

const anthropic: LlmConfig = { provider: 'anthropic', baseUrl: defaultBaseUrl('anthropic'), apiKey: 'sk-ant-test', model: '' }
const openai: LlmConfig = { provider: 'openai', baseUrl: defaultBaseUrl('openai'), apiKey: 'sk-test', model: 'gpt-x' }
const ollama: LlmConfig = { provider: 'ollama', baseUrl: defaultBaseUrl('ollama'), apiKey: '', model: 'llava' }

type Call = { url: string; init: RequestInit }
function stubFetch(answer: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const call = { url: String(url), init }
    calls.push(call)
    return answer(call, calls.length)
  }))
  return calls
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const body = (c: Call) => JSON.parse(String(c.init.body))

beforeEach(() => {
  vi.unstubAllGlobals()
  session.server = false
  sdk.options = undefined
  sdk.params = undefined
  sdk.models = []
  useAuthStore.setState({ token: null })
})

describe('provider defaults', () => {
  it('prefills the base URL of each provider', () => {
    expect(defaultBaseUrl('anthropic')).toBe('https://api.anthropic.com')
    expect(defaultBaseUrl('openai')).toBe('https://api.openai.com/v1')
    expect(defaultBaseUrl('ollama')).toBe('http://localhost:11434/v1')
    expect(defaultBaseUrl('openai-compatible')).toBe('')
  })
})

describe('complete, straight from the browser', () => {
  it('Anthropic: the SDK from the browser, default model claude-opus-5-5, images as base64 blocks', async () => {
    sdk.next = async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Hello' }] })
    const result = await complete(anthropic, {
      system: 'SYS',
      messages: [{ role: 'user', text: 'What is it?', images: [VISION_PROBE_PNG] }],
      maxTokens: 100,
    })
    expect(result).toEqual({ text: 'Hello', model: 'claude-opus-5-5', stopReason: 'end_turn' })
    expect(sdk.options).toMatchObject({ apiKey: 'sk-ant-test', dangerouslyAllowBrowser: true })
    expect(sdk.params).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 100, system: 'SYS' })
    const [message] = sdk.params!.messages as { role: string; content: unknown[] }[]
    expect(message.role).toBe('user')
    expect(message.content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: VISION_PROBE_PNG.split(',')[1] } })
    expect(message.content[1]).toEqual({ type: 'text', text: 'What is it?' })
  })

  it('Anthropic: a JSON schema becomes a structured output; refusals and cut answers are typed errors', async () => {
    sdk.next = async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] })
    await complete(anthropic, { messages: [{ role: 'user', text: 'x' }], json: { schema: { type: 'object' } } })
    expect(sdk.params!.output_config).toEqual({ format: { type: 'json_schema', schema: { type: 'object' } } })
    sdk.next = async () => ({ stop_reason: 'refusal', content: [] })
    await expect(complete(anthropic, { messages: [{ role: 'user', text: 'x' }] })).rejects.toMatchObject({ code: 'refusal' })
    sdk.next = async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{' }] })
    await expect(complete(anthropic, { messages: [{ role: 'user', text: 'x' }] })).rejects.toMatchObject({ code: 'truncated' })
  })

  it('Anthropic: a rejected key or a rate limit is said in words', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    sdk.next = async () => { throw new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', undefined as never) }
    await expect(complete(anthropic, { messages: [{ role: 'user', text: 'x' }] })).rejects.toThrow('The API key was not accepted by Anthropic.')
    sdk.next = async () => { throw new Anthropic.RateLimitError(429, undefined, 'slow down', undefined as never) }
    await expect(complete(anthropic, { messages: [{ role: 'user', text: 'x' }] })).rejects.toThrow('Anthropic is rate limiting this key')
  })

  it('OpenAI: chat completions with the key, images as image_url data URLs, JSON mode', async () => {
    const calls = stubFetch(() => json({ model: 'gpt-x-2026', choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }] }))
    const result = await complete(openai, {
      system: 'SYS', messages: [{ role: 'user', text: 'Look', images: [VISION_PROBE_PNG] }], json: true, maxTokens: 50,
    })
    expect(result).toEqual({ text: 'Hi', model: 'gpt-x-2026', stopReason: 'stop' })
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    expect(body(calls[0])).toEqual({
      model: 'gpt-x',
      max_completion_tokens: 50,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: [{ type: 'text', text: 'Look' }, { type: 'image_url', image_url: { url: VISION_PROBE_PNG } }] },
      ],
    })
  })

  it('OpenAI: a 401, a 429 or a cut answer give readable errors with the provider\'s words', async () => {
    stubFetch((_, n) => n === 1
      ? json({ error: { message: 'Incorrect API key provided' } }, 401)
      : n === 2 ? json({ error: { message: 'Too many' } }, 429)
        : json({ choices: [{ message: { content: 'par' }, finish_reason: 'length' }] }))
    const request = { messages: [{ role: 'user' as const, text: 'x' }] }
    const auth = await complete(openai, request).catch((e: LlmError) => e)
    expect(auth).toBeInstanceOf(LlmError)
    expect(auth).toMatchObject({ code: 'auth' })
    expect((auth as Error).message).toContain('The API key was not accepted by OpenAI.')
    expect((auth as Error).message).toContain('Incorrect API key provided')
    await expect(complete(openai, request)).rejects.toMatchObject({ code: 'rate_limit', message: expect.stringContaining('rate limiting') })
    await expect(complete(openai, request)).rejects.toMatchObject({ code: 'truncated' })
  })

  it('Ollama: no key is sent; when it cannot be reached the error explains OLLAMA_ORIGINS', async () => {
    const calls = stubFetch((_, n) => {
      if (n === 1) return json({ model: 'llava', choices: [{ message: { content: 'ok' } }] })
      throw new TypeError('Failed to fetch')
    })
    expect((await complete(ollama, { messages: [{ role: 'user', text: 'x' }] })).text).toBe('ok')
    expect(calls[0].url).toBe('http://localhost:11434/v1/chat/completions')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined()
    await complete(ollama, { messages: [{ role: 'user', text: 'x' }], maxTokens: 9 }).catch(() => null)
    expect(body(calls[1]).max_tokens).toBe(9)
    const error = await complete(ollama, { messages: [{ role: 'user', text: 'x' }] }).catch((e: LlmError) => e)
    expect(error).toMatchObject({ code: 'network' })
    expect((error as Error).message).toContain('OLLAMA_ORIGINS')
  })

  it('refuses a configuration without a model or a base URL before calling anyone', async () => {
    const calls = stubFetch(() => json({}))
    await expect(complete({ ...openai, model: '' }, { messages: [{ role: 'user', text: 'x' }] })).rejects.toMatchObject({ code: 'config' })
    await expect(complete({ ...openai, provider: 'openai-compatible', baseUrl: '' }, { messages: [{ role: 'user', text: 'x' }] }))
      .rejects.toMatchObject({ code: 'config' })
    expect(calls).toHaveLength(0)
  })
})

describe('complete through the own server', () => {
  it('posts the config and the request to /api/llm/complete with the session token', async () => {
    session.server = true
    useAuthStore.setState({ token: 'jwt' })
    const calls = stubFetch(() => json({ text: 'proxied', model: 'gpt-x', stopReason: 'stop' }))
    const request = { system: 's', messages: [{ role: 'user' as const, text: 'x' }], json: true }
    expect(await complete(openai, request)).toEqual({ text: 'proxied', model: 'gpt-x', stopReason: 'stop' })
    expect(calls[0].url).toBe('/api/llm/complete')
    expect(calls[0].init.method).toBe('POST')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer jwt')
    expect(body(calls[0])).toEqual({ config: openai, request })
  })

  it('a refused proxied call keeps the server\'s readable error and its code', async () => {
    session.server = true
    stubFetch(() => json({ error: 'The API key was not accepted by OpenAI.', code: 'auth' }, 502))
    await expect(complete(openai, { messages: [{ role: 'user', text: 'x' }] }))
      .rejects.toMatchObject({ code: 'auth', message: 'The API key was not accepted by OpenAI.' })
  })

  it('lists models through /api/llm/models', async () => {
    session.server = true
    const calls = stubFetch(() => json({ models: ['a', 'b'] }))
    expect(await listModels(ollama)).toEqual(['a', 'b'])
    expect(calls[0].url).toBe('/api/llm/models')
    expect(body(calls[0])).toEqual({ config: ollama })
  })
})

describe('listModels, straight from the browser', () => {
  it('Anthropic lists through the SDK', async () => {
    sdk.models = ['claude-opus-5-5', 'claude-sonnet-5-5']
    expect(await listModels(anthropic)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5'])
  })

  it('OpenAI-style lists GET <base>/models, sorted', async () => {
    const calls = stubFetch(() => json({ data: [{ id: 'z' }, { id: 'a' }] }))
    expect(await listModels(openai)).toEqual(['a', 'z'])
    expect(calls[0].url).toBe('https://api.openai.com/v1/models')
    expect(calls[0].init.method ?? 'GET').toBe('GET')
  })

  it('Ollama falls back to /api/tags when /v1/models is not there', async () => {
    const calls = stubFetch((_, n) => n === 1 ? json({}, 404) : json({ models: [{ name: 'llava:latest' }, { name: 'llama3' }] }))
    expect(await listModels(ollama)).toEqual(['llama3', 'llava:latest'])
    expect(calls[1].url).toBe('http://localhost:11434/api/tags')
  })
})

describe('testLlm', () => {
  it('replies OK and probes vision with a tiny image', async () => {
    const calls = stubFetch((_, n) => json({ model: 'llava', choices: [{ message: { content: n === 1 ? 'OK' : 'Red.' } }] }))
    const result = await testLlm(ollama, { vision: true })
    expect(result).toMatchObject({ ok: true, model: 'llava', vision: true })
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(body(calls[0]).messages.at(-1).content).toContain('Reply with OK')
    expect(JSON.stringify(body(calls[1]))).toContain('data:image/png;base64,')
  })

  it('a model that cannot see reports vision no; without the probe vision stays unknown', async () => {
    stubFetch((_, n) => n === 1 ? json({ choices: [{ message: { content: 'OK' } }] }) : json({ error: { message: 'image input is not supported' } }, 400))
    expect(await testLlm(ollama, { vision: true })).toMatchObject({ ok: true, vision: false })
    stubFetch(() => json({ choices: [{ message: { content: 'OK' } }] }))
    expect(await testLlm(ollama)).toMatchObject({ ok: true, vision: null, model: 'llava' })
  })

  it('a failing provider gives ok false with the readable error', async () => {
    stubFetch(() => json({ error: { message: 'bad' } }, 401))
    const result = await testLlm(openai, { vision: true })
    expect(result).toMatchObject({ ok: false, vision: null })
    expect(result.error).toContain('The API key was not accepted by OpenAI.')
  })
})

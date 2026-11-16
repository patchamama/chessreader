import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: { options?: unknown; params?: Record<string, unknown> } = {}
let next: () => Promise<unknown> = async () => ({})

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500 }
  class AuthenticationError extends APIError { status = 401 }
  class RateLimitError extends APIError { status = 429 }
  class Anthropic {
    static APIError = APIError
    static AuthenticationError = AuthenticationError
    static RateLimitError = RateLimitError
    beta = { messages: { stream: (params: Record<string, unknown>) => { calls.params = params; return { finalMessage: () => next() } } } }
    constructor(options: unknown) { calls.options = options }
  }
  return { default: Anthropic }
})

import Anthropic from '@anthropic-ai/sdk'
import { claudeModel, CLAUDE_DEFAULT_MODEL } from './claudeModel'
import { configuredModel } from './aiCommentary'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

beforeEach(() => {
  calls.options = undefined
  calls.params = undefined
  useSettingsStore.getState().reset()
})

describe('claudeModel', () => {
  it('asks Claude Opus 5.5 for JSON through the SDK, from the browser, with the user\'s key', async () => {
    next = async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"intro":"x","comments":[]}' }] })
    const text = await claudeModel('sk-ant-test').complete('SYSTEM', 'USER')
    expect(text).toBe('{"intro":"x","comments":[]}')
    expect(calls.options).toMatchObject({ apiKey: 'sk-ant-test', dangerouslyAllowBrowser: true })
    expect(CLAUDE_DEFAULT_MODEL).toBe('claude-opus-5-5')
    expect(calls.params).toMatchObject({
      model: 'claude-opus-5-5', system: 'SYSTEM', messages: [{ role: 'user', content: 'USER' }],
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    })
    const config = calls.params!.output_config as { format: { type: string; schema: { required: string[] } } }
    expect(config.format.type).toBe('json_schema')
    expect(config.format.schema.required).toEqual(['intro', 'comments'])
    // Sampling parameters and thinking budgets are rejected by this model: none is sent.
    expect(calls.params).not.toHaveProperty('temperature')
    expect(calls.params).not.toHaveProperty('thinking')
  })

  it('uses the model id typed in Settings when there is one', async () => {
    next = async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] })
    await claudeModel('k', 'claude-sonnet-5-5').complete('s', 'u')
    expect(calls.params!.model).toBe('claude-sonnet-5-5')
  })

  it('says so when the model declines, is cut short or the key is wrong', async () => {
    next = async () => ({ stop_reason: 'refusal', content: [] })
    await expect(claudeModel('k').complete('s', 'u')).rejects.toThrow('The model declined to comment this game.')
    next = async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"intro":' }] })
    await expect(claudeModel('k').complete('s', 'u')).rejects.toThrow('The commentary was cut short')
    next = async () => { throw new Anthropic.AuthenticationError(401, undefined, 'bad key', undefined as never) }
    await expect(claudeModel('k').complete('s', 'u')).rejects.toThrow('The API key was not accepted by Anthropic.')
  })

  it('is the configured model when Claude is chosen and a key is set (no model id needed)', () => {
    useSettingsStore.setState({ aiProvider: 'anthropic' })
    expect(configuredModel()).toBeNull()
    useSettingsStore.setState({ aiKey: 'sk-ant-x' })
    expect(configuredModel()).not.toBeNull()
  })
})

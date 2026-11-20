import Anthropic from '@anthropic-ai/sdk'
import { LlmError, httpError, networkError } from './errors'
import { ANTHROPIC_BASE_URL, ANTHROPIC_DEFAULT_MODEL, type LlmConfig, type LlmRequest, type LlmResult } from './types'
import { finish, splitDataUrl } from './shared'

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

function client(config: LlmConfig): Anthropic {
  // The key is the user's and lives in their browser: that is the case this flag exists for.
  return new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true })
}

/** One message to Claude through the official SDK, straight from the browser. */
export async function completeAnthropic(config: LlmConfig, request: LlmRequest): Promise<LlmResult> {
  const model = config.model.trim() || ANTHROPIC_DEFAULT_MODEL
  const messages = request.messages.map((m) => {
    if (!m.images?.length) return { role: m.role, content: m.text }
    const images = m.images.map((url) => {
      const { mediaType, data } = splitDataUrl(url)
      return { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as ImageMediaType, data } }
    })
    return { role: m.role, content: [...images, { type: 'text' as const, text: m.text }] }
  })
  const schema = typeof request.json === 'object' ? request.json.schema : null
  let message
  try {
    // Streamed so a long answer does not hit a request timeout; only the final message is used.
    message = await client(config).beta.messages
      .stream({
        model,
        max_tokens: request.maxTokens ?? 4096,
        ...(request.system ? { system: request.system } : {}),
        messages,
        ...(schema ? { output_config: { format: { type: 'json_schema' as const, schema } } } : {}),
        // If the model declines, the API retries on a fallback model in the same call.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })
      .finalMessage()
  } catch (error) {
    throw anthropicError(error)
  }
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
  return finish({ text, model: message.model ?? model, stopReason: message.stop_reason ?? undefined })
}

/** The model ids the key can use. */
export async function listAnthropicModels(config: LlmConfig): Promise<string[]> {
  const ids: string[] = []
  try {
    for await (const info of client(config).models.list()) ids.push(info.id)
  } catch (error) {
    throw anthropicError(error)
  }
  return ids
}

function anthropicError(error: unknown): unknown {
  if (error instanceof LlmError) return error
  if (error instanceof Anthropic.AuthenticationError) return new LlmError('auth', 'The API key was not accepted by Anthropic.', 401)
  if (error instanceof Anthropic.RateLimitError) return new LlmError('rate_limit', 'Anthropic is rate limiting this key: try again in a moment.', 429)
  if (Anthropic.APIConnectionError && error instanceof Anthropic.APIConnectionError) return networkError('anthropic', ANTHROPIC_BASE_URL)
  if (error instanceof Anthropic.APIError) return httpError('anthropic', error.status ?? 500, error.message)
  return error
}

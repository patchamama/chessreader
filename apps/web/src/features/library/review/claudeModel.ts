import Anthropic from '@anthropic-ai/sdk'
import type { CommentaryModel } from './aiCommentary'

export const CLAUDE_DEFAULT_MODEL = 'claude-opus-5-5'

/** The shape of the answer: an opening paragraph and one remark per commented ply. */
const COMMENTARY_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    comments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ply: { type: 'integer' }, text: { type: 'string' } },
        required: ['ply', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['intro', 'comments'],
  additionalProperties: false,
}

/**
 * Claude as the commentary model, called from the browser with the user's own
 * key (the key never passes through this app's server).
 */
export function claudeModel(apiKey: string, model: string = CLAUDE_DEFAULT_MODEL): CommentaryModel {
  // The key is the user's and lives in their browser: that is the case this flag exists for.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  return {
    async complete(system, user) {
      let message
      try {
        // Streamed so a long game does not hit a request timeout; only the final message is used.
        message = await client.beta.messages
          .stream({
            model,
            max_tokens: 32000,
            system,
            messages: [{ role: 'user', content: user }],
            output_config: { format: { type: 'json_schema', schema: COMMENTARY_SCHEMA } },
            // If the model declines, the API retries on a fallback model in the same call.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
          })
          .finalMessage()
      } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) throw new Error('The API key was not accepted by Anthropic.')
        if (error instanceof Anthropic.RateLimitError) throw new Error('Anthropic is rate limiting this key: try again in a moment.')
        if (error instanceof Anthropic.APIError) throw new Error(`Anthropic answered ${error.status}: ${error.message}`)
        throw error
      }
      if (message.stop_reason === 'refusal') throw new Error('The model declined to comment this game.')
      if (message.stop_reason === 'max_tokens') throw new Error('The commentary was cut short (the game is too long for one answer).')
      const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
      if (!text) throw new Error('The model returned an empty answer.')
      return text
    },
  }
}

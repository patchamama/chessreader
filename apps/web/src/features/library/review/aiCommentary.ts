import { annotateGame, buildCommentaryRequest, parseCommentaryResponse, type AnnotateOptions } from '@chess-ebook/chess-shared'
import type { GameReview, Lang, PlyInput } from '@chess-ebook/chess-shared'
import { complete, configuredLlm, defaultBaseUrl, LlmError, type LlmConfig, type LlmTransport } from '../../../shared/llm'

/**
 * Commentary written by a language model the user brings (their own key).
 * The model gets the facts — engine verdicts, better lines, detected ideas,
 * who attacks and defends what — and returns remarks per move; they are put on
 * the moves by the same annotator as the rule-based commentary.
 */
export interface CommentaryModel {
  /** Sends the instructions and the facts; returns the model's raw answer. */
  complete(system: string, user: string): Promise<string>
}

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

/** Any model of the shared LLM client as the commentary model (JSON answer, room for a long game). */
export function llmCommentaryModel(config: LlmConfig, transport: LlmTransport = 'auto'): CommentaryModel {
  return {
    async complete(system, user) {
      try {
        const result = await complete(config, {
          system,
          messages: [{ role: 'user', text: user }],
          json: { schema: COMMENTARY_SCHEMA },
          // Claude needs a limit and gets a large one; OpenAI-style servers keep their own.
          maxTokens: config.provider === 'anthropic' ? 32000 : undefined,
        }, transport)
        return result.text
      } catch (error) {
        if (error instanceof LlmError && error.code === 'refusal') throw new Error('The model declined to comment this game.')
        if (error instanceof LlmError && error.code === 'truncated') throw new Error('The commentary was cut short (the game is too long for one answer).')
        throw error
      }
    },
  }
}

/** OpenAI chat completions with a JSON answer, straight from the browser. */
export function openAiModel(apiKey: string, model: string): CommentaryModel {
  return llmCommentaryModel({ provider: 'openai', baseUrl: defaultBaseUrl('openai'), apiKey, model }, 'direct')
}

/** The model chosen in Settings, or null when none is set up. */
export function configuredModel(): CommentaryModel | null {
  const config = configuredLlm()
  return config ? llmCommentaryModel(config) : null
}

export interface AiCommentaryInput {
  plies: PlyInput[]
  review: GameReview
  lang: Lang
  white?: string | null
  black?: string | null
  /** Book layout and diagrams, as for the rule-based commentary. */
  layout?: AnnotateOptions['layout']
  diagrams?: AnnotateOptions['diagrams']
}

/** The game annotated with the model's remarks (better lines and marks still come from the engine). */
export async function commentWithModel(model: CommentaryModel, input: AiCommentaryInput): Promise<string> {
  const request = buildCommentaryRequest(input.plies, input.review, input)
  const parsed = parseCommentaryResponse(await model.complete(request.system, request.user), input.plies.length)
  if (Object.keys(parsed.comments).length === 0) throw new Error('The model returned no remarks for this game.')
  return annotateGame(input.plies, input.review, {
    level: 2, lang: input.lang, white: input.white, black: input.black, intro: parsed.intro || undefined, remarks: parsed.comments,
    layout: input.layout, diagrams: input.diagrams,
  })
}

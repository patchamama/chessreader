import { ANTHROPIC_BASE_URL, ANTHROPIC_DEFAULT_MODEL } from '../../../shared/llm'
import { llmCommentaryModel, type CommentaryModel } from './aiCommentary'

export const CLAUDE_DEFAULT_MODEL = ANTHROPIC_DEFAULT_MODEL

/**
 * Claude as the commentary model, called straight from the browser with the
 * user's own key (through the shared LLM client).
 */
export function claudeModel(apiKey: string, model: string = CLAUDE_DEFAULT_MODEL): CommentaryModel {
  return llmCommentaryModel({ provider: 'anthropic', baseUrl: ANTHROPIC_BASE_URL, apiKey, model }, 'direct')
}

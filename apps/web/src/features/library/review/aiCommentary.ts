import { annotateGame, buildCommentaryRequest, parseCommentaryResponse } from '@chess-ebook/chess-shared'
import type { GameReview, Lang, PlyInput } from '@chess-ebook/chess-shared'
import { useSettingsStore } from '../../../shared/settings/settingsStore'

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

/** OpenAI chat completions with a JSON answer. */
export function openAiModel(apiKey: string, model: string): CommentaryModel {
  return {
    async complete(system, user) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_object' },
        }),
      })
      const data = (await response.json().catch(() => null)) as
        | { choices?: { message?: { content?: string } }[]; error?: { message?: string } }
        | null
      if (!response.ok) throw new Error(data?.error?.message ?? `The model service answered ${response.status}.`)
      const text = data?.choices?.[0]?.message?.content
      if (!text) throw new Error('The model returned an empty answer.')
      return text
    },
  }
}

/** The model chosen in Settings, or null when none is set up. */
export function configuredModel(): CommentaryModel | null {
  const s = useSettingsStore.getState()
  if (s.aiProvider === 'openai' && s.aiKey.trim() && s.aiModel.trim()) return openAiModel(s.aiKey.trim(), s.aiModel.trim())
  return null
}

export interface AiCommentaryInput {
  plies: PlyInput[]
  review: GameReview
  lang: Lang
  white?: string | null
  black?: string | null
}

/** The game annotated with the model's remarks (better lines and marks still come from the engine). */
export async function commentWithModel(model: CommentaryModel, input: AiCommentaryInput): Promise<string> {
  const request = buildCommentaryRequest(input.plies, input.review, input)
  const parsed = parseCommentaryResponse(await model.complete(request.system, request.user), input.plies.length)
  if (Object.keys(parsed.comments).length === 0) throw new Error('The model returned no remarks for this game.')
  return annotateGame(input.plies, input.review, {
    level: 2, lang: input.lang, white: input.white, black: input.black, intro: parsed.intro || undefined, remarks: parsed.comments,
  })
}

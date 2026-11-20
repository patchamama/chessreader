import { LlmError } from './errors'
import type { LlmResult } from './types'

/** A data URL split into its media type and base64 payload. */
export function splitDataUrl(url: string): { mediaType: string; data: string } {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url)
  if (!m) throw new LlmError('config', 'An image must be a PNG, JPEG, GIF or WebP data URL.')
  return { mediaType: m[1], data: m[2] }
}

/** Refusals, cut answers and empty answers become typed errors; a good answer passes through. */
export function finish(result: LlmResult): LlmResult {
  if (result.stopReason === 'refusal' || result.stopReason === 'content_filter') throw new LlmError('refusal', 'The model declined to answer.')
  if (result.stopReason === 'max_tokens' || result.stopReason === 'length') throw new LlmError('truncated', 'The answer was cut short (it did not fit in one reply).')
  if (!result.text) throw new LlmError('empty', 'The model returned an empty answer.')
  return result
}

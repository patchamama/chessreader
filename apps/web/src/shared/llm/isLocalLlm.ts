import type { LlmConfig } from './types'

/** Whether the model runs on this machine or network (fast to reach, slow to answer): Ollama, or a loopback, .local or private address. */
export function isLocalLlm(config: Pick<LlmConfig, 'provider' | 'baseUrl'>): boolean {
  if (config.provider === 'ollama') return true
  let host: string
  try {
    host = new URL(config.baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    return false
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return true
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

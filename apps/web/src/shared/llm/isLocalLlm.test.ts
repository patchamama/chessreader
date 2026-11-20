import { describe, expect, it } from 'vitest'
import { isLocalLlm } from './isLocalLlm'

const cfg = (provider: string, baseUrl: string) => ({ provider, baseUrl, apiKey: '', model: 'm' }) as Parameters<typeof isLocalLlm>[0]

describe('isLocalLlm', () => {
  it('Ollama is local whatever its URL', () => {
    expect(isLocalLlm(cfg('ollama', 'https://gpu.example.com/v1'))).toBe(true)
  })
  it.each(['http://localhost:1234/v1', 'http://127.0.0.1:8080', 'http://[::1]:8080/v1', 'http://mac.local:1234', 'http://10.0.0.5/v1', 'http://192.168.1.9:11434', 'http://172.16.0.1', 'http://172.31.255.1'])('%s is local', (url) => {
    expect(isLocalLlm(cfg('openai-compatible', url))).toBe(true)
  })
  it.each(['https://api.openai.com/v1', 'https://api.anthropic.com', 'http://172.32.0.1', 'http://172.15.0.1', 'http://11.0.0.1', 'https://notlocal.example.com'])('%s is not local', (url) => {
    expect(isLocalLlm(cfg('openai-compatible', url))).toBe(false)
  })
  it('an unparsable URL is not local', () => {
    expect(isLocalLlm(cfg('openai-compatible', 'nonsense'))).toBe(false)
  })
})

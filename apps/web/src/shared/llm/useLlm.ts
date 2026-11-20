import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSettingsStore, type AppSettings } from '../settings/settingsStore'
import { complete, LlmError } from './llmClient'
import { defaultBaseUrl, needsKey, type LlmConfig, type LlmRequest, type LlmResult } from './types'

type AiSettings = Pick<AppSettings, 'aiProvider' | 'aiBaseUrl' | 'aiKey' | 'aiModel'>

/** The model set up in Settings, or null while it is off or incomplete. */
export function llmConfigOf(s: AiSettings): LlmConfig | null {
  if (s.aiProvider === 'none') return null
  // An empty base URL means the provider's own (an older setup saved none).
  const baseUrl = s.aiBaseUrl.trim() || defaultBaseUrl(s.aiProvider)
  const config: LlmConfig = { provider: s.aiProvider, baseUrl, apiKey: s.aiKey.trim(), model: s.aiModel.trim() }
  if (needsKey(config.provider) && !config.apiKey) return null
  if (config.provider !== 'anthropic' && (!config.baseUrl || !config.model)) return null
  return config
}

/** The configured model now (outside React). */
export function configuredLlm(): LlmConfig | null {
  return llmConfigOf(useSettingsStore.getState())
}

/** Whether the configured model can read images: Claude can; others as the last Test found. */
export function visionOf(config: LlmConfig | null, tested: boolean | null): boolean {
  if (!config) return false
  return tested ?? config.provider === 'anthropic'
}

export interface UseLlm {
  /** A model is set up: AI actions may be offered. */
  available: boolean
  /** It can read images: image actions may be offered. */
  vision: boolean
  config: LlmConfig | null
  complete: (request: LlmRequest) => Promise<LlmResult>
}

/** The AI assistant of Settings, for components that offer AI actions. */
export function useLlm(): UseLlm {
  const settings = useSettingsStore(useShallow((s) => ({
    aiProvider: s.aiProvider, aiBaseUrl: s.aiBaseUrl, aiKey: s.aiKey, aiModel: s.aiModel, aiVision: s.aiVision,
  })))
  const config = useMemo(() => llmConfigOf(settings), [settings])
  const run = useCallback((request: LlmRequest) => {
    if (!config) return Promise.reject(new LlmError('config', 'Set up the AI assistant in Settings first.'))
    return complete(config, request)
  }, [config])
  return { available: !!config, vision: visionOf(config, settings.aiVision), config, complete: run }
}

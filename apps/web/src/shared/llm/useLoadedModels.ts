import { useEffect, useState } from 'react'
import { useSettingsStore } from '../settings/settingsStore'
import { defaultBaseUrl } from './types'
import { ollamaRootOf, parseLoadedModels, type LoadedModel } from './gpuModels'

const POLL_MS = 10_000

/**
 * The models Ollama has loaded now (`/api/ps`), refreshed every 10 s while the page
 * is visible. Only for the Ollama provider; offline, CORS or none loaded gives [].
 */
export function useLoadedModels(): LoadedModel[] {
  const provider = useSettingsStore((s) => s.aiProvider)
  const baseUrl = useSettingsStore((s) => s.aiBaseUrl)
  const [models, setModels] = useState<LoadedModel[]>([])
  const root = provider === 'ollama' ? ollamaRootOf(baseUrl.trim() || defaultBaseUrl('ollama')) : ''

  useEffect(() => {
    if (!root) { setModels([]); return }
    let alive = true
    const poll = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const res = await fetch(`${root}/api/ps`)
        const next = res.ok ? parseLoadedModels(await res.json()) : []
        if (alive) setModels(next)
      } catch { if (alive) setModels([]) }
    }
    void poll()
    const id = setInterval(() => void poll(), POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [root])

  return models
}

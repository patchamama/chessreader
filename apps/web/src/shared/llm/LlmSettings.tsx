import { useState } from 'react'
import { PromptsModal } from './PromptsModal'
import { useSettingsStore } from '../settings/settingsStore'
import { hasServerSession } from '../api/serverSession'
import { listModels, testLlm } from './llmClient'
import { llmConfigOf } from './useLlm'
import { ANTHROPIC_DEFAULT_MODEL, LLM_PROVIDERS, defaultBaseUrl, needsKey, type LlmConfig, type LlmProvider } from './types'

const labelClass = 'block text-xs font-semibold text-gray-300 mb-1 mt-3 break-after-avoid'
const inputClass = 'w-full rounded bg-gray-700 border border-gray-600 px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-400'
const linkButton = 'underline disabled:opacity-40'

type Status = { ok: boolean; message: string } | null

/** The "AI assistant" section of Settings: provider, base URL, key, model, Test. */
export function LlmSettings() {
  const s = useSettingsStore()
  const [models, setModels] = useState<string[] | null>(null)
  const [modelsStatus, setModelsStatus] = useState<Status>(null)
  const [testStatus, setTestStatus] = useState<Status>(null)
  const [promptsOpen, setPromptsOpen] = useState(false)
  const provider = s.aiProvider
  // Load models and Test use what is typed, even before it is complete.
  const draft: LlmConfig | null = provider === 'none' ? null : {
    provider, baseUrl: s.aiBaseUrl.trim() || defaultBaseUrl(provider), apiKey: s.aiKey.trim(), model: s.aiModel.trim(),
  }
  const ready = !!llmConfigOf(s)

  const chooseProvider = (value: 'none' | LlmProvider) => {
    s.set({ aiProvider: value, aiBaseUrl: value === 'none' ? '' : defaultBaseUrl(value), aiModel: '', aiVision: null })
    setModels(null)
    setModelsStatus(null)
    setTestStatus(null)
  }

  const loadModels = async () => {
    if (!draft) return
    setModelsStatus({ ok: true, message: '…' })
    try {
      const ids = await listModels(draft)
      setModels(ids)
      setModelsStatus({ ok: true, message: `${ids.length} models` })
    } catch (e) {
      setModels(null)
      setModelsStatus({ ok: false, message: (e as Error).message })
    }
  }

  const test = async () => {
    if (!draft) return
    setTestStatus({ ok: true, message: 'Testing…' })
    const result = await testLlm(draft, { vision: true })
    if (!result.ok) {
      setTestStatus({ ok: false, message: result.error ?? 'The test failed.' })
      return
    }
    s.set({ aiVision: result.vision })
    setTestStatus({ ok: true, message: `✓ ${result.model} · ${result.latencyMs} ms · vision ${result.vision ? 'yes' : 'no'}` })
  }

  return (
    <>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-amber-400">AI assistant</p>
      <label className={labelClass} htmlFor="ai-provider">Provider</label>
      <select id="ai-provider" aria-label="AI provider" className={inputClass} value={provider} onChange={(e) => chooseProvider(e.target.value as 'none' | LlmProvider)}>
        <option value="none">Off — no AI actions (rule-based commentary only)</option>
        {(Object.keys(LLM_PROVIDERS) as LlmProvider[]).map((p) => <option key={p} value={p}>{LLM_PROVIDERS[p]}</option>)}
      </select>
      {draft && (
        <>
          {provider === 'anthropic' ? (
            <p className="mt-1 text-[11px] text-gray-400">Anthropic's own API (https://api.anthropic.com).</p>
          ) : (
            <>
              <label className={labelClass} htmlFor="ai-base-url">Base URL</label>
              <input id="ai-base-url" aria-label="AI base URL" autoComplete="off" className={inputClass} placeholder="https://host/v1"
                value={s.aiBaseUrl} onChange={(e) => s.set({ aiBaseUrl: e.target.value.trim() })} />
            </>
          )}
          {provider !== 'ollama' && (
            <>
              <label className={labelClass} htmlFor="ai-key">API key{needsKey(draft.provider) ? '' : ' (if the server needs one)'}</label>
              <input id="ai-key" aria-label="AI API key" type="password" autoComplete="off" className={inputClass}
                value={s.aiKey} onChange={(e) => s.set({ aiKey: e.target.value })} />
            </>
          )}
          <label className={labelClass} htmlFor="ai-model">
            Model{provider === 'anthropic' ? ` (empty = ${ANTHROPIC_DEFAULT_MODEL})` : ''}
          </label>
          <input id="ai-model" aria-label="AI model" autoComplete="off" className={inputClass}
            value={s.aiModel} onChange={(e) => s.set({ aiModel: e.target.value, aiVision: null })} />
          {models && models.length > 0 && (
            <select aria-label="Loaded models" className={`${inputClass} mt-1`} value={models.includes(s.aiModel) ? s.aiModel : ''}
              onChange={(e) => e.target.value && s.set({ aiModel: e.target.value, aiVision: null })}>
              <option value="">Choose a loaded model…</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-gray-300">
            <button className={linkButton} onClick={() => void loadModels()}>Load models</button>
            <button className={linkButton} onClick={() => void test()} disabled={!ready}>Test</button>
          </p>
          {modelsStatus && <p role="status" aria-label="Models list" className={`text-[11px] ${modelsStatus.ok ? 'text-gray-300' : 'text-red-300'}`}>{modelsStatus.message}</p>}
          {testStatus && <p role="status" aria-label="AI test result" className={`text-[11px] ${testStatus.ok ? 'text-green-300' : 'text-red-300'}`}>{testStatus.message}</p>}
          {provider === 'ollama' && !hasServerSession() && (
            <p className="mt-1 text-[10px] text-gray-400">
              From the browser Ollama must allow this page: start it with OLLAMA_ORIGINS={window.location.origin} (or OLLAMA_ORIGINS=*).
            </p>
          )}
          <p className="mt-1 text-[10px] text-gray-400">
            {hasServerSession()
              ? 'The key stays in this browser; it is sent with each request to your own server, which passes it to the provider and does not store or log it.'
              : 'The key stays in this browser and is sent only to the provider.'}
            {' '}The model receives only what an AI action sends it (for commentary: the moves, the engine verdicts and the board facts).
          </p>
        </>
      )}
      <p className="mt-2 text-[11px] text-gray-300">
        <button className={linkButton} onClick={() => setPromptsOpen(true)}>View all AI prompts</button>
      </p>
      {promptsOpen && <PromptsModal onClose={() => setPromptsOpen(false)} />}
    </>
  )
}

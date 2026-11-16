import { useEffect, useState } from 'react'
import { useSettingsStore, type VoiceProvider } from './settingsStore'
import { httpClient } from '../api/httpClient'
import { useAuthStore } from '../../features/auth/store/authStore'

const label = 'block text-xs font-semibold text-gray-300 mb-1 mt-3 break-after-avoid'
const input = 'w-full rounded bg-gray-700 border border-gray-600 px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-400'

const PROVIDERS: Record<VoiceProvider, string> = {
  browser: 'Browser voice (live only, no file)',
  system: 'Server system voices (macOS, Windows, Linux)',
  piper: 'Piper — free neural voices on the server',
  openai: 'OpenAI text-to-speech (paid)',
  elevenlabs: 'ElevenLabs (paid)',
}
const SAMPLE = { es: 'Caballo por e 5, jaque. Las blancas dominan el centro.', en: 'Knight takes e 5, check. White controls the centre.', de: 'Springer schlägt e 5, Schach. Weiß beherrscht das Zentrum.' }

interface ServerProvider { id: string; voices: Array<{ id: string; name: string; lang: string }> }

/** Who narrates: the browser's own voice, or a voice of the server that can also be saved as MP3. */
export function VoiceSettings() {
  const s = useSettingsStore()
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([])
  const [serverVoices, setServerVoices] = useState<ServerProvider[]>([])
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!synth) return
    const read = () => setBrowserVoices(synth.getVoices())
    read()
    synth.addEventListener?.('voiceschanged', read)
    return () => synth.removeEventListener?.('voiceschanged', read)
  }, [])

  useEffect(() => {
    if (s.voiceProvider === 'browser') return
    let live = true
    httpClient<{ providers: ServerProvider[] }>('/api/narration/providers')
      .then((r) => { if (live) setServerVoices(r.providers) })
      .catch(() => { if (live) setServerVoices([]) })
    return () => { live = false }
  }, [s.voiceProvider])

  async function test() {
    setStatus('…')
    const text = SAMPLE[s.language]
    try {
      if (s.voiceProvider === 'browser') {
        const synth = window.speechSynthesis
        if (!synth) throw new Error('This browser has no speech synthesis.')
        const u = new SpeechSynthesisUtterance(text)
        u.lang = { es: 'es-ES', en: 'en-US', de: 'de-DE' }[s.language]
        u.rate = s.voiceRate
        const voice = synth.getVoices().find((v) => v.name === s.browserVoice)
        if (voice) u.voice = voice
        synth.cancel()
        synth.speak(u)
        setStatus('OK')
        return
      }
      const apiKey = s.voiceProvider === 'openai' ? s.openaiKey : s.voiceProvider === 'elevenlabs' ? s.elevenlabsKey : ''
      const r = await httpClient<{ audioUrl: string; total: number }>('/api/narration/render', {
        method: 'POST',
        body: JSON.stringify({
          segments: [text], lang: s.language,
          voice: { provider: s.voiceProvider, voice: s.voiceName, rate: s.voiceRate, model: s.voiceModel, ...(apiKey ? { apiKey } : {}) },
        }),
      })
      const { token } = useAuthStore.getState()
      const blob = await (await fetch(r.audioUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })).blob()
      void new Audio(URL.createObjectURL(blob)).play()
      setStatus(`OK · ${r.total.toFixed(1)} s`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  const voices = serverVoices.find((p) => p.id === s.voiceProvider)?.voices ?? []
  const forLang = browserVoices.filter((v) => v.lang.toLowerCase().startsWith(s.language))

  return (
    <div>
      <label className={label} htmlFor="voice-provider">Narration voice</label>
      <select id="voice-provider" className={input} value={s.voiceProvider} onChange={(e) => s.set({ voiceProvider: e.target.value as VoiceProvider, voiceName: '' })}>
        {(Object.keys(PROVIDERS) as VoiceProvider[]).map((p) => <option key={p} value={p}>{PROVIDERS[p]}</option>)}
      </select>
      <p className="mt-1 text-[11px] text-gray-400">Anthropic offers no text-to-speech API, so it cannot be a voice.</p>

      {s.voiceProvider === 'browser' ? (
        <>
          <label className={label} htmlFor="browser-voice">Browser voice ({s.language})</label>
          <select id="browser-voice" className={input} value={s.browserVoice} onChange={(e) => s.set({ browserVoice: e.target.value })}>
            <option value="">Default</option>
            {(forLang.length ? forLang : browserVoices).map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
          </select>
        </>
      ) : (
        <>
          <label className={label} htmlFor="server-voice">
            {s.voiceProvider === 'elevenlabs' ? 'Voice id' : s.voiceProvider === 'piper' ? 'Voice model (.onnx name or path)' : 'Voice'} (empty = default)
          </label>
          <input id="server-voice" className={input} list="server-voices" value={s.voiceName} onChange={(e) => s.set({ voiceName: e.target.value })} />
          <datalist id="server-voices">
            {voices.filter((v) => !v.lang || v.lang === s.language).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </datalist>
        </>
      )}

      {(s.voiceProvider === 'openai' || s.voiceProvider === 'elevenlabs') && (
        <>
          <label className={label} htmlFor="voice-key">API key (kept in this browser, sent only to render audio)</label>
          <input
            id="voice-key" type="password" autoComplete="off" className={input}
            value={s.voiceProvider === 'openai' ? s.openaiKey : s.elevenlabsKey}
            onChange={(e) => s.set(s.voiceProvider === 'openai' ? { openaiKey: e.target.value } : { elevenlabsKey: e.target.value })}
          />
          <label className={label} htmlFor="voice-model">Model (empty = default)</label>
          <input id="voice-model" className={input} value={s.voiceModel} onChange={(e) => s.set({ voiceModel: e.target.value })} />
        </>
      )}

      <label className={label} htmlFor="voice-rate">Speed: {s.voiceRate.toFixed(2)}×</label>
      <input id="voice-rate" type="range" min={0.5} max={2} step={0.05} value={s.voiceRate} onChange={(e) => s.set({ voiceRate: Number(e.target.value) })} className="w-full" />

      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => void test()} className="rounded border border-amber-400 bg-amber-400 px-2 py-1 text-xs font-semibold text-gray-900 hover:bg-amber-300">
          Test voice
        </button>
        {status && <span role="status" className="text-xs text-gray-300">{status}</span>}
      </div>
    </div>
  )
}

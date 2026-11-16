import type { Lang } from '@chess-ebook/chess-shared'

/** Something that can say a sentence aloud and resolves when it is done. */
export interface Speaker {
  speak(text: string, lang: Lang, rate: number): Promise<void>
  cancel(): void
}

const LOCALE: Record<Lang, string> = { es: 'es-ES', en: 'en-US', de: 'de-DE' }

/**
 * Narrator on the browser's speech synthesis (no network, no key). Where the
 * browser has no synthesiser the narration still runs, silently, at reading
 * pace — the board and the captions keep their timing.
 */
export function browserSpeaker(): Speaker {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  let pending: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const finish = () => {
    if (timer) { clearTimeout(timer); timer = null }
    const done = pending
    pending = null
    done?.()
  }
  return {
    speak(text, lang, rate) {
      return new Promise<void>((resolve) => {
        pending = resolve
        if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
          timer = setTimeout(finish, Math.max(700, (text.length * 55) / rate))
          return
        }
        const u = new SpeechSynthesisUtterance(text)
        u.lang = LOCALE[lang]
        u.rate = rate
        const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang))
        if (voice) u.voice = voice
        u.onend = finish
        u.onerror = finish
        synth.speak(u)
      })
    },
    cancel() {
      synth?.cancel()
      finish()
    },
  }
}

import { useSettingsStore } from '../settings/settingsStore'
import { PIECE_FIGURINES, PIECE_LETTERS } from './notation'

/**
 * Small icon that switches every notation of the app between figurines (♞f3)
 * and the letters of the selected language (Cf3): it shows what a click turns
 * the pieces into, and writes the shared `notationStyle` setting (S12).
 */
export function NotationToggle({ className }: { className?: string }) {
  const style = useSettingsStore((s) => s.notationStyle)
  const lang = useSettingsStore((s) => s.language)
  const set = useSettingsStore((s) => s.set)
  const toFigurine = style !== 'figurine'
  const label = toFigurine ? 'Show pieces as figurines' : 'Show pieces as letters'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => set({ notationStyle: toFigurine ? 'figurine' : 'letters' })}
      className={className ?? 'flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-base text-slate-600 transition hover:bg-slate-50'}
    >
      {toFigurine ? PIECE_FIGURINES.N : (PIECE_LETTERS[lang] ?? PIECE_LETTERS.en).N}
    </button>
  )
}

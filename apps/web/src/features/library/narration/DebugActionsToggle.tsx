import { useSettingsStore } from '../../../shared/settings/settingsStore'

/**
 * Reader-toolbar button: show or hide the compact narration actions (the guides) next to the
 * comments of the whole document (ai-narration-guides S1). Offered only where the debug tools are.
 */
export function DebugActionsToggle() {
  const on = useSettingsStore((s) => s.debugActions)
  const set = useSettingsStore((s) => s.set)
  const label = on ? 'Hide narration guides' : 'Show narration guides'
  return (
    <button
      type="button"
      onClick={() => set({ debugActions: !on })}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 font-mono text-[11px] font-semibold shadow-sm transition ${
        on ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <span aria-hidden="true">{'{a}'}</span>
    </button>
  )
}

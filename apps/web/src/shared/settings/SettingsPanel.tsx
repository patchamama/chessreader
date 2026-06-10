import { useSettingsStore, BOARD_THEMES, FONT_FAMILIES, type BoardTheme, type FontFamily, type EvalBarDirection } from './settingsStore'

interface SettingsPanelProps {
  onClose: () => void
}

const labelClass = 'block text-xs font-semibold text-gray-300 mb-1 mt-3'
const inputClass = 'w-full rounded bg-gray-700 border border-gray-600 px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-400'

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const s = useSettingsStore()

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto h-full w-80 bg-gray-900 shadow-2xl overflow-y-auto p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        {/* Board theme */}
        <label className={labelClass}>Board theme</label>
        <div className="grid grid-cols-3 gap-1">
          {(Object.entries(BOARD_THEMES) as [BoardTheme, typeof BOARD_THEMES[BoardTheme]][]).map(([key, t]) => (
            <button
              key={key}
              onClick={() => s.set({ boardTheme: key })}
              className={`rounded p-1 text-[11px] font-medium border-2 transition-colors ${
                s.boardTheme === key ? 'border-amber-400' : 'border-transparent'
              }`}
              style={{ background: `linear-gradient(135deg, ${t.light} 50%, ${t.dark} 50%)` }}
              title={t.label}
            >
              <span className="block bg-black/40 rounded px-1 text-white">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Eval bar direction */}
        <label className={labelClass}>Eval bar direction</label>
        <div className="flex gap-2">
          {(['horizontal', 'vertical'] as EvalBarDirection[]).map((d) => (
            <button
              key={d}
              onClick={() => s.set({ evalBarDirection: d })}
              className={`flex-1 rounded py-1 text-xs border transition-colors ${
                s.evalBarDirection === d
                  ? 'bg-amber-400 text-gray-900 border-amber-400 font-semibold'
                  : 'bg-gray-700 text-gray-200 border-gray-600 hover:border-amber-400'
              }`}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>

        {/* Font family */}
        <label className={labelClass}>Font family</label>
        <select
          value={s.fontFamily}
          onChange={(e) => s.set({ fontFamily: e.target.value as FontFamily })}
          className={inputClass}
        >
          {(Object.entries(FONT_FAMILIES) as [FontFamily, typeof FONT_FAMILIES[FontFamily]][]).map(([key, f]) => (
            <option key={key} value={key}>{f.label}</option>
          ))}
        </select>

        {/* Font size */}
        <label className={labelClass}>Font size — {s.fontSize}px</label>
        <input
          type="range" min={12} max={22} step={1}
          value={s.fontSize}
          onChange={(e) => s.set({ fontSize: Number(e.target.value) })}
          className="w-full accent-amber-400"
        />

        {/* Background color */}
        <label className={labelClass}>Background color</label>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={s.bgColor}
            onChange={(e) => s.set({ bgColor: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          />
          <input
            type="text"
            value={s.bgColor}
            onChange={(e) => s.set({ bgColor: e.target.value })}
            className={`${inputClass} flex-1`}
            maxLength={7}
          />
        </div>

        {/* Text color */}
        <label className={labelClass}>Text color</label>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={s.textColor}
            onChange={(e) => s.set({ textColor: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
          />
          <input
            type="text"
            value={s.textColor}
            onChange={(e) => s.set({ textColor: e.target.value })}
            className={`${inputClass} flex-1`}
            maxLength={7}
          />
        </div>

        {/* Horizontal margin */}
        <label className={labelClass}>Horizontal margin — {s.marginH}rem</label>
        <input
          type="range" min={0} max={6} step={0.5}
          value={s.marginH}
          onChange={(e) => s.set({ marginH: Number(e.target.value) })}
          className="w-full accent-amber-400"
        />

        {/* Reset */}
        <button
          onClick={s.reset}
          className="mt-4 w-full rounded py-1.5 text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  )
}

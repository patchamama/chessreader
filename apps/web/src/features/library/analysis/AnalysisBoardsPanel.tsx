import { useState } from 'react'
import { useSettingsStore, type AppLanguage } from '../../../shared/settings/settingsStore'
import { activateAnalysisBoard, closeAnalysisBoard, useAnalysisBoards } from './analysisBoards'
import { AnalysisBoardView } from './AnalysisBoardView'

const T: Record<AppLanguage, { title: string; close: string; collapse: string; expand: string }> = {
  en: { title: 'Analysis boards', close: 'Close', collapse: 'Collapse the analysis boards', expand: 'Expand the analysis boards' },
  es: { title: 'Tableros de análisis', close: 'Cerrar', collapse: 'Plegar los tableros de análisis', expand: 'Desplegar los tableros de análisis' },
  de: { title: 'Analysebretter', close: 'Schließen', collapse: 'Analysebretter einklappen', expand: 'Analysebretter ausklappen' },
}

/**
 * The open analysis boards, floating over the page (right side on a desktop, a
 * bottom sheet on a phone): one tab per board, each closable, the active one
 * with its line, comment and narration. It never touches the study board.
 * Mounted once in the app layout; it shows nothing while no board is open.
 */
export function AnalysisBoardsPanel() {
  const { boards, active } = useAnalysisBoards()
  const lang = useSettingsStore((s) => s.language)
  const t = T[lang] ?? T.en
  const [collapsed, setCollapsed] = useState(false)
  if (boards.length === 0) return null
  const current = boards.find((b) => b.id === active) ?? boards[boards.length - 1]

  return (
    <aside
      aria-label={t.title}
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[75vh] flex-col rounded-t-xl border border-slate-300 bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:max-h-[calc(100vh-6rem)] sm:w-[360px] sm:rounded-xl"
    >
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-1">
        <div role="tablist" aria-label={t.title} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {boards.map((b) => (
            <span key={b.id} className={`flex shrink-0 items-center rounded-t border-b-2 ${b.id === current.id ? 'border-emerald-600 bg-emerald-50' : 'border-transparent'}`}>
              <button
                type="button"
                role="tab"
                aria-selected={b.id === current.id}
                className="max-w-[10rem] truncate px-2 py-1 text-xs font-medium text-slate-700"
                onClick={() => { activateAnalysisBoard(b.id); setCollapsed(false) }}
              >
                {b.title}
              </button>
              <button
                type="button"
                aria-label={`${t.close} ${b.title}`}
                className="px-1 text-xs text-slate-400 hover:text-red-600"
                onClick={() => closeAnalysisBoard(b.id)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          aria-label={collapsed ? t.expand : t.collapse}
          aria-expanded={!collapsed}
          className="shrink-0 rounded px-1.5 text-sm text-slate-500 hover:bg-slate-100"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? '▴' : '▾'}
        </button>
      </div>
      {!collapsed && (
        <div role="tabpanel" className="overflow-y-auto p-2">
          <AnalysisBoardView key={current.id} board={current} />
        </div>
      )}
    </aside>
  )
}

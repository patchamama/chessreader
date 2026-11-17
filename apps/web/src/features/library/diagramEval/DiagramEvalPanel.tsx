import { useRef, useState } from 'react'
import type { Lang } from '@chess-ebook/chess-shared'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { evaluateDiagrams, useDiagramEvalStore } from './diagramEvalStore'

const T: Record<Lang, Record<string, string>> = {
  en: { title: 'Diagram evaluations', count: 'diagrams in this chapter', evaluated: 'evaluated', missing: 'Add where missing', replace: 'Replace all', show: 'Show under the diagrams', bar: 'Evaluation bar', cancel: 'Cancel', lines: 'Lines', depth: 'Depth' },
  es: { title: 'Evaluación de los diagramas', count: 'diagramas en este capítulo', evaluated: 'evaluados', missing: 'Agregar donde falte', replace: 'Sustituir todas', show: 'Mostrar bajo los diagramas', bar: 'Barra de evaluación', cancel: 'Cancelar', lines: 'Líneas', depth: 'Profundidad' },
  de: { title: 'Diagrammbewertungen', count: 'Diagramme in diesem Kapitel', evaluated: 'bewertet', missing: 'Fehlende ergänzen', replace: 'Alle ersetzen', show: 'Unter den Diagrammen zeigen', bar: 'Bewertungsbalken', cancel: 'Abbrechen', lines: 'Varianten', depth: 'Tiefe' },
}

/**
 * Evaluate every diagram of the chapter with the engine: only those without an
 * evaluation, or all of them again (replacing the ones there were).
 */
export function DiagramEvalPanel({ fens }: { fens: string[] }) {
  const lang = useSettingsStore((s) => s.language) as Lang
  const s = useSettingsStore()
  const t = T[lang] ?? T.en
  const done = useDiagramEvalStore((st) => fens.filter((f) => st.get(f)).length)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const run = async (mode: 'missing' | 'replace') => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setProgress({ done: 0, total: 0 })
    try {
      await evaluateDiagrams(fens, mode, (d, total) => setProgress({ done: d, total }), ctrl.signal)
    } finally {
      setProgress(null)
    }
  }
  const button = 'rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  return (
    <section aria-label={t.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">{t.title}</h3>
      <p className="mt-1 text-xs text-slate-600">{fens.length} {t.count} · {done} {t.evaluated}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {progress ? (
          <>
            <span role="status" className="text-xs text-slate-600">{progress.done}/{progress.total || '…'}</span>
            <button className={button} onClick={() => abort.current?.abort()}>{t.cancel}</button>
          </>
        ) : (
          <>
            <button className={button} disabled={done === fens.length} onClick={() => void run('missing')}>{t.missing}</button>
            <button className={button} onClick={() => void run('replace')}>{t.replace}</button>
          </>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-700">
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.diagramEvalShow} onChange={(e) => s.set({ diagramEvalShow: e.target.checked })} />{t.show}</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.diagramEvalBar} onChange={(e) => s.set({ diagramEvalBar: e.target.checked })} />{t.bar}</label>
        <label className="flex items-center gap-1">{t.lines}
          <select aria-label={t.lines} value={s.diagramEvalLines} onChange={(e) => s.set({ diagramEvalLines: Number(e.target.value) })} className="rounded border border-slate-300 bg-white px-1">
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">{t.depth}
          <select aria-label={t.depth} value={s.diagramEvalDepth} onChange={(e) => s.set({ diagramEvalDepth: Number(e.target.value) })} className="rounded border border-slate-300 bg-white px-1">
            {[10, 12, 14, 16, 18, 20, 22].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    </section>
  )
}

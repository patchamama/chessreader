import { useState } from 'react'
import type { Lang } from '@chess-ebook/chess-shared'
import { useSettingsStore } from '../../../shared/settings/settingsStore'
import { relabelTask, withProgress } from '../../../shared/layout/busyStore'
import { evaluateDiagram } from '../diagramEval/diagramEvalStore'
import { diagramEvalText } from '../diagramEval/diagramEvalText'
import {
  collectDiagrams,
  downloadFiles,
  regeneratedFileName,
  renderDiagramBlob,
  textFileName,
  uniqueNames,
  type DiagramRef,
  type DownloadFile,
} from '../utils/diagramFiles'

const T: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Diagram tools',
    images: 'Regenerate all diagrams and download',
    evals: 'Regenerate evaluations and download',
    busyImages: 'Regenerating diagrams',
    busyEvals: 'Evaluating diagrams',
    none: 'No diagrams in this text',
    doneImages: 'diagrams downloaded',
    doneEvals: 'evaluations downloaded',
    failed: 'Could not finish',
  },
  es: {
    title: 'Herramientas de diagramas',
    images: 'Regenerar todos los diagramas y descargar',
    evals: 'Regenerar evaluaciones y descargar',
    busyImages: 'Regenerando diagramas',
    busyEvals: 'Evaluando diagramas',
    none: 'No hay diagramas en este texto',
    doneImages: 'diagramas descargados',
    doneEvals: 'evaluaciones descargadas',
    failed: 'No se pudo terminar',
  },
  de: {
    title: 'Diagramm-Werkzeuge',
    images: 'Alle Diagramme neu erzeugen und herunterladen',
    evals: 'Bewertungen neu erzeugen und herunterladen',
    busyImages: 'Erzeuge Diagramme',
    busyEvals: 'Bewerte Diagramme',
    none: 'Keine Diagramme in diesem Text',
    doneImages: 'Diagramme heruntergeladen',
    doneEvals: 'Bewertungen heruntergeladen',
    failed: 'Konnte nicht abschließen',
  },
}

/**
 * Run `work` over every diagram with the status footer showing its progress
 * ("Regenerating diagrams 3/12" and the bar), collecting one file per diagram.
 */
async function eachWithProgress(
  label: string,
  diagrams: DiagramRef[],
  work: (d: DiagramRef) => Promise<DownloadFile>,
): Promise<DownloadFile[]> {
  const total = diagrams.length
  let current = `${label} 0/${total}`
  const relabel = (next: string) => {
    relabelTask(current, next)
    current = next
  }
  return withProgress(current, async (report) => {
    const files: DownloadFile[] = []
    for (let i = 0; i < total; i++) {
      relabel(`${label} ${i + 1}/${total}`)
      files.push(await work(diagrams[i]))
      report(i + 1, total)
    }
    return files
  })
}

/**
 * Reader control panel: regenerate every diagram of the text and download the
 * images under the names of the image files the text references, or evaluate
 * every diagram with the engine chosen in Settings and download one text file
 * per diagram (named after its image) with the evaluation.
 */
export function DiagramToolsPanel({ root }: { root?: ParentNode | null }) {
  const lang = useSettingsStore((s) => s.language) as Lang
  const t = T[lang] ?? T.en
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const run = async (kind: 'images' | 'evals') => {
    const diagrams = collectDiagrams(root ?? document)
    if (!diagrams.length) return setStatus(t.none)
    setRunning(true)
    setStatus(null)
    try {
      const files =
        kind === 'images'
          ? await eachWithProgress(t.busyImages, diagrams, async (d) => {
              const { name, type } = regeneratedFileName(d.fileName)
              return { name, blob: await renderDiagramBlob(d.fen, type) }
            })
          : await eachWithProgress(t.busyEvals, diagrams, async (d) => {
              const e = await evaluateDiagram(d.fen, { engine: 'settings' })
              return { name: textFileName(d.fileName), blob: new Blob([diagramEvalText(d.fen, e, lang)], { type: 'text/plain;charset=utf-8' }) }
            })
      const names = uniqueNames(files.map((f) => f.name))
      await downloadFiles(files.map((f, i) => ({ ...f, name: names[i] })))
      setStatus(`${files.length} ${kind === 'images' ? t.doneImages : t.doneEvals}`)
    } catch {
      setStatus(t.failed)
    } finally {
      setRunning(false)
    }
  }

  const button = 'rounded border border-slate-200 bg-white px-2 py-1 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'
  return (
    <section aria-label={t.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">{t.title}</h3>
      <div className="mt-2 flex flex-col gap-1.5">
        <button type="button" className={button} disabled={running} onClick={() => void run('images')}>{t.images}</button>
        <button type="button" className={button} disabled={running} onClick={() => void run('evals')}>{t.evals}</button>
      </div>
      {status && <p role="status" className="mt-2 text-xs text-slate-600">{status}</p>}
    </section>
  )
}

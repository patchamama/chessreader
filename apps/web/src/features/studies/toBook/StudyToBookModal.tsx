import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { withProgress } from '../../../shared/layout/busyStore'
import { useLlm } from '../../../shared/llm'
import { TARGET_LANGS, langName, type TargetLang } from '../../comments/commentPrompts'
import { evaluateDiagram } from '../../library/diagramEval/diagramEvalStore'
import { BOOK_STYLE_LABEL, useDiagramStyleStore, type DiagramStyle } from '../../library/utils/boardSvg'
import type { Complete } from '../../library/translate/translateGame'
import type { StudyPart } from '../openStudy'
import { buildStudyBook, candidateMoves, isIncluded, type BuildDeps, type BuildOptions } from './buildBook'
import { coverDataUrl, coverDesigns, coverFromFile, renderCover, type CoverImage } from './coverDesigns'
import { addStudyBook, type AddStudyBook } from './studyBookApi'
import { parseStudyChapters } from './studyChapters'

export interface StudyToBookProps {
  study: { name: string; author: string | null }
  parts: StudyPart[]
  onClose: () => void
  onAdded: (message: string) => void
  /** Seams for tests: the engine, the model and the upload. */
  evaluate?: BuildDeps['evaluate']
  complete?: Complete
  post?: AddStudyBook
}

const box = 'rounded border border-slate-200 p-2'

/**
 * "Add to library as a book": choose how the Lichess study becomes an EPUB
 * (translation, diagrams and their style, engine evaluation, cover) and add it
 * to the library. The work shows its progress in the status footer and can be
 * cancelled there.
 */
export default function StudyToBookModal({ study, parts, onClose, onAdded, evaluate, complete, post = addStudyBook }: StudyToBookProps) {
  const llm = useLlm()
  const queryClient = useQueryClient()
  const chapters = useMemo(() => parts.flatMap((p) => parseStudyChapters(p.pgn).map((c) => (parts.length > 1 ? { ...c, name: `${p.name}: ${c.name}` } : c))), [parts])
  const candidates = useMemo(() => candidateMoves(chapters), [chapters])

  const [title, setTitle] = useState(study.name)
  const [author, setAuthor] = useState(study.author ?? '')
  const [language, setLanguage] = useState<TargetLang>('en')
  const [translate, setTranslate] = useState(false)
  const [startDiagrams, setStartDiagrams] = useState(true)
  const [autoGood, setAutoGood] = useState(false)
  const [autoBad, setAutoBad] = useState(false)
  const [engineQuality, setEngineQuality] = useState(false)
  const [engineEval, setEngineEval] = useState(true)
  const [diagramStyle, setDiagramStyle] = useState<DiagramStyle>(useDiagramStyleStore.getState().style)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [coverMode, setCoverMode] = useState<'generate' | 'upload'>('generate')
  const [designId, setDesignId] = useState('board')
  const [uploaded, setUploaded] = useState<{ name: string; image: CoverImage } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const designs = useMemo(() => coverDesigns(title.trim() || 'Untitled', author.trim()), [title, author])
  const options: BuildOptions = { title: title.trim(), author: author.trim(), language, translate, startDiagrams, autoGood, autoBad, engineQuality, engineEval, diagramStyle, overrides }
  const canTranslate = !!complete || llm.available
  const noChapters = chapters.length === 0

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    try { setUploaded({ name: file.name, image: await coverFromFile(file) }); setError(null) } catch (e) { setError((e as Error).message) }
  }

  const submit = () => {
    if (!options.title) { setError('Give the book a title'); return }
    if (translate && !canTranslate) { setError('Set up the AI assistant in Settings to translate'); return }
    if (coverMode === 'upload' && !uploaded) { setError('Choose a cover image or generate one'); return }
    setError(null); setWorking(true)
    void withProgress('Adding the study to the library', async (report, signal) => {
      const book = await buildStudyBook(chapters, options, { evaluate: evaluate ?? ((fen) => evaluateDiagram(fen)), ...(translate ? { complete: complete ?? llm.complete } : {}) }, { signal, onProgress: report })
      book.cover = coverMode === 'upload' ? uploaded!.image : await renderCover((designs.find((d) => d.id === designId) ?? designs[0]).svg)
      const { bookId } = await post(book, signal)
      void queryClient.invalidateQueries({ queryKey: ['library', 'books'] })
      const warn = book.warnings.length ? ` (${book.warnings.length} warnings, e.g. ${book.warnings[0]})` : ''
      onAdded(`"${options.title}" was added to the library as book ${bookId}${warn}`)
      onClose()
    }, { cancellable: true }).catch((e: unknown) => {
      setError((e as Error)?.name === 'AbortError' ? 'Cancelled' : e instanceof Error ? e.message : String(e))
    }).finally(() => setWorking(false))
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Add to library as a book" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-3xl space-y-3 rounded bg-white p-4 text-sm shadow-lg">
        <h2 className="text-base font-semibold">Add to library as a book</h2>
        <p className="text-xs text-slate-500">Turns the study into an EPUB (one chapter per study chapter) and adds it to your library.</p>
        {error && <p role="alert" className="rounded bg-red-50 p-2 text-red-700">{error}</p>}
        {noChapters && <p role="alert" className="rounded bg-amber-50 p-2 text-amber-800">This study has no chapters to convert.</p>}

        <section aria-label="Book" className={`${box} grid gap-2 sm:grid-cols-2`}>
          <label className="flex flex-col text-xs">Title<input aria-label="Book title" value={title} onChange={(e) => setTitle(e.target.value)} className="rounded border border-slate-300 px-1 py-0.5 text-sm" /></label>
          <label className="flex flex-col text-xs">Author<input aria-label="Book author" value={author} onChange={(e) => setAuthor(e.target.value)} className="rounded border border-slate-300 px-1 py-0.5 text-sm" /></label>
          <label className="flex flex-col text-xs">Language of the book
            <select aria-label="Book language" value={language} onChange={(e) => setLanguage(e.target.value as TargetLang)} className="rounded border border-slate-300 px-1 py-0.5 text-sm">
              {TARGET_LANGS.map((l) => <option key={l} value={l}>{langName(l)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 self-end text-xs" title={canTranslate ? '' : 'Set up the AI assistant in Settings first'}>
            <input type="checkbox" aria-label="Translate to the book language" checked={translate} disabled={!canTranslate} onChange={(e) => setTranslate(e.target.checked)} />
            Translate the comments and chapter titles to this language (AI assistant, one call per comment)
          </label>
        </section>

        <section aria-label="Diagrams" className={`${box} space-y-1 text-xs`}>
          <h3 className="font-semibold text-slate-700">Diagrams</h3>
          <label className="flex items-center gap-1"><input type="checkbox" checked={startDiagrams} onChange={(e) => setStartDiagrams(e.target.checked)} />Diagram of the starting position of each chapter</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={autoGood} onChange={(e) => setAutoGood(e.target.checked)} />Automatic diagram before the comment after a good move (!, !!)</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={autoBad} onChange={(e) => setAutoBad(e.target.checked)} />Automatic diagram before the comment after a bad move (?, ??), main line only</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={engineQuality} onChange={(e) => setEngineQuality(e.target.checked)} />Also let the engine find good and bad moves among the unmarked ones (slower)</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={engineEval} onChange={(e) => setEngineEval(e.target.checked)} />Engine evaluation under each diagram</label>
          <fieldset className="flex flex-wrap items-center gap-3"><legend className="sr-only">Diagram style</legend>
            Style:
            <label className="flex items-center gap-1"><input type="radio" name="diagram-style" checked={diagramStyle === 'book'} onChange={() => setDiagramStyle('book')} />{BOOK_STYLE_LABEL}</label>
            <label className="flex items-center gap-1"><input type="radio" name="diagram-style" checked={diagramStyle === 'theme'} onChange={() => setDiagramStyle('theme')} />Board theme of the diagram menu</label>
          </fieldset>
          {candidates.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Diagram for each commented main-line move ({candidates.length})</summary>
              <ul aria-label="Commented moves" className="mt-1 max-h-48 overflow-y-auto">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" aria-label={`Diagram for ${c.chapter} ${c.move.text}`} checked={isIncluded(c, options)} onChange={(e) => setOverrides((cur) => ({ ...cur, [c.id]: e.target.checked }))} />
                      <span className="text-slate-500">{c.chapter}</span> <span className="font-mono">{c.move.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section aria-label="Cover" className={`${box} space-y-2 text-xs`}>
          <h3 className="font-semibold text-slate-700">Cover</h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-1"><input type="radio" name="cover-mode" checked={coverMode === 'generate'} onChange={() => setCoverMode('generate')} />Generate from the title and author</label>
            <label className="flex items-center gap-1"><input type="radio" name="cover-mode" checked={coverMode === 'upload'} onChange={() => setCoverMode('upload')} />Upload an image</label>
          </div>
          {coverMode === 'generate' ? (
            <ul aria-label="Cover designs" className="flex flex-wrap gap-3">
              {designs.map((d) => (
                <li key={d.id}>
                  <label className={`flex cursor-pointer flex-col items-center gap-1 rounded border p-1 ${designId === d.id ? 'border-blue-600 ring-2 ring-blue-300' : 'border-slate-200'}`}>
                    <img src={coverDataUrl(d.svg)} alt={`Cover design: ${d.label}`} className="h-40 w-auto" />
                    <span className="flex items-center gap-1"><input type="radio" name="cover-design" aria-label={`Cover design ${d.label}`} checked={designId === d.id} onChange={() => setDesignId(d.id)} />{d.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <input type="file" aria-label="Cover image" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => void pickFile(e.target.files?.[0])} />
              {uploaded && <p className="mt-1">Chosen: {uploaded.name}</p>}
            </div>
          )}
        </section>

        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border border-slate-300 px-3 py-1" onClick={onClose}>Close</button>
          <button type="button" className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50" disabled={working || noChapters} onClick={submit}>Add to library</button>
        </div>
      </div>
    </div>
  )
}

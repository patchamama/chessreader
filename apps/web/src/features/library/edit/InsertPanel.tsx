import { useMemo, useState } from 'react'
import { validateFen } from 'chess.js'
import { hasServerSession } from '../../../shared/api/serverSession'
import { uploadSuggestionAsset } from '../../suggestions/epubApi'
import { sanitizeHtml } from '../../suggestions/suggestionApply'
import type { SuggestionAnchor } from '../../suggestions/suggestionFormat'
import type { SaveSuggestionResult } from '../../suggestions/suggestionsApi'
import { boardSvgDataUrl } from '../utils/boardSvg'
import { INITIAL_FEN, type MoveBefore } from '../utils/inferDiagramFen'
import { diagramImageSrc } from './diagramImage'
import { diagramHtml, imageHtml, saveEdit, textToHtml } from './editSave'
import { markdownToHtml } from './markdown'
import { EditDialog } from './EditDialog'

type Tab = 'text' | 'diagram' | 'html' | 'image'
const TABS: Array<[Tab, string]> = [['text', 'Text'], ['diagram', 'Diagram'], ['html', 'HTML / Markdown'], ['image', 'Image']]

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_UPLOAD = 5 * 1024 * 1024
const MAX_DATA_URL = 1024 * 1024
const HTTP = /^https?:\/\/[^\s"'<>]+$/i

const moveName = (m: MoveBefore) => `${m.moveNumber}${m.color === 'white' ? '.' : '...'}${m.san}`

const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error ?? new Error('the image could not be read'))
  reader.readAsDataURL(file)
})

export interface InsertPanelProps {
  book: string
  chapter: number
  anchor: SuggestionAnchor
  position: { main: MoveBefore | null; variation: MoveBefore | null }
  onClose: () => void
  onSaved: (result: SaveSuggestionResult) => void
}

/** The ＋ of edit mode: a text, a diagram, HTML or Markdown, or an image inserted after a block (S8). */
export function InsertPanel({ book, chapter, anchor, position, onClose, onSaved }: InsertPanelProps) {
  const [tab, setTab] = useState<Tab>('text')
  const [text, setText] = useState('')
  const [source, setSource] = useState<'main' | 'variation'>('main')
  const startFen = (from: 'main' | 'variation') => (from === 'variation' ? position.variation : position.main)?.fen ?? INITIAL_FEN
  const [fen, setFen] = useState(() => startFen('main'))
  const [markup, setMarkup] = useState('')
  const [image, setImage] = useState<{ src: string; display?: string } | null>(null)
  const [url, setUrl] = useState('')
  const [alt, setAlt] = useState('')
  const [imageError, setImageError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fenProblem = useMemo(() => {
    const r = validateFen(fen.trim())
    return r.ok ? null : `Not a valid FEN: ${r.error ?? 'unknown error'}`
  }, [fen])
  const html = useMemo(() => (markup.trim() ? sanitizeHtml(markdownToHtml(markup)) : ''), [markup])
  const imageSrc = image?.src ?? (HTTP.test(url.trim()) ? url.trim() : null)

  const ready = !busy && (
    tab === 'text' ? text.trim() !== ''
      : tab === 'diagram' ? !fenProblem
        : tab === 'html' ? html.trim() !== ''
          : !!imageSrc)

  const pickSource = (from: 'main' | 'variation') => {
    setSource(from)
    setFen(startFen(from))
  }

  const onFile = async (file: File | undefined) => {
    setImageError(null)
    setImage(null)
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) { setImageError('The image must be a PNG, JPEG or WebP file.'); return }
    const server = hasServerSession()
    if (file.size > (server ? MAX_UPLOAD : MAX_DATA_URL)) {
      setImageError(server ? 'The image must be at most 5 MB.' : 'Without a server the image must be at most 1 MB (5 MB with one).')
      return
    }
    setBusy(true)
    try {
      const data = await readDataUrl(file)
      setImage(server ? { src: await uploadSuggestionAsset(file), display: data } : { src: data })
    } catch (e) {
      setImageError(`The image could not be stored: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      let after = ''
      let display: string | undefined
      if (tab === 'text') after = textToHtml(text)
      else if (tab === 'diagram') after = diagramHtml(fen.trim(), await diagramImageSrc(fen.trim()))
      else if (tab === 'html') after = html
      else if (imageSrc) {
        after = imageHtml(imageSrc, alt.trim())
        if (image?.display) display = imageHtml(image.display, alt.trim())
      }
      const result = await saveEdit({ kind: 'insert', target: { book, chapter, anchor }, before: null, after: { html: after }, author: 'user', display })
      onSaved(result)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <EditDialog label="Insert content" onClose={onClose}>
      <div role="tablist" aria-label="What to insert" className="mb-3 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-t px-3 py-1.5 text-sm ${tab === id ? 'border-b-2 border-blue-600 font-semibold text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-3 text-sm">
        {tab === 'text' && (
          <>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Text</span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="w-full rounded border border-slate-300 p-2" />
            </label>
            <p className="text-xs text-slate-500">Moves written in the text are read by the reader once it is shown in the chapter. A blank line starts a new paragraph.</p>
          </>
        )}

        {tab === 'diagram' && (
          <>
            {position.variation && (
              <fieldset className="space-y-1">
                <legend className="font-medium text-slate-700">Position</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="diagram-source" checked={source === 'main'} onChange={() => pickSource('main')} />
                  Main line{position.main ? ` (after ${moveName(position.main)})` : ' (start)'}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="diagram-source" checked={source === 'variation'} onChange={() => pickSource('variation')} />
                  Variation (after {moveName(position.variation)})
                </label>
              </fieldset>
            )}
            {!position.variation && (
              <p className="text-slate-600">{position.main ? `Position after ${moveName(position.main)}, the last main-line move before this point.` : 'No move before this point: the initial position.'}</p>
            )}
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">FEN</span>
              <input value={fen} onChange={(e) => setFen(e.target.value)} spellCheck={false} className="w-full rounded border border-slate-300 p-2 font-mono text-xs" />
            </label>
            {fenProblem
              ? <p role="alert" className="text-red-700">{fenProblem}</p>
              : <img src={boardSvgDataUrl(fen.trim())} alt="Diagram preview" width={160} height={160} className="h-40 w-40 rounded border border-slate-200" />}
          </>
        )}

        {tab === 'html' && (
          <>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Markdown or HTML</span>
              <textarea value={markup} onChange={(e) => setMarkup(e.target.value)} rows={8} spellCheck={false} className="w-full rounded border border-slate-300 p-2 font-mono text-xs" />
            </label>
            <p className="text-xs text-slate-500">Converted and sanitised; external images (http/https) stay external links when the EPUB is written.</p>
            <div data-testid="insert-preview" className="epub-content max-h-60 overflow-auto rounded border border-dashed border-slate-300 p-2" dangerouslySetInnerHTML={{ __html: html }} />
          </>
        )}

        {tab === 'image' && (
          <>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Upload an image</span>
              <input type="file" accept={IMAGE_TYPES.join(',')} onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            <p className="text-xs text-slate-500">PNG, JPEG or WebP: up to 5 MB stored on the server, or 1 MB kept in the suggestion without one.</p>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Image URL</span>
              <input value={url} onChange={(e) => { setUrl(e.target.value); setImage(null) }} placeholder="https://…" disabled={!!image} className="w-full rounded border border-slate-300 p-2" />
            </label>
            <p className="text-xs text-slate-500">An external image stays external when the server writes the EPUB.</p>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Description</span>
              <input value={alt} onChange={(e) => setAlt(e.target.value)} className="w-full rounded border border-slate-300 p-2" />
            </label>
            {imageError && <p role="alert" className="text-red-700">{imageError}</p>}
            {(image?.display ?? imageSrc) && <img src={image?.display ?? imageSrc ?? ''} alt="Image preview" className="max-h-40 rounded border border-slate-200" />}
          </>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={!ready} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
          Save suggestion
        </button>
      </div>
    </EditDialog>
  )
}

import { useEffect, useState } from 'react'
import { listBookImages, uploadSuggestionAsset, type BookImage } from '../../suggestions/epubApi'
import { saveSuggestion } from '../../suggestions/suggestionsApi'
import { buildSuggestion } from '../../suggestions/suggestionFormat'
import { withBusy } from '../../../shared/layout/busyStore'

interface Props {
  book: { id: number; title: string }
  onClose: () => void
}

type Choice = { kind: 'upload'; file: File; preview: string } | { kind: 'book'; image: BookImage }

/**
 * Cover… of a library book (S6): upload an image or pick one of the book's
 * own images, saved as a 'cover' suggestion. An admin accepts it and writes
 * it into the EPUB from Errors → Suggestions ("Apply to EPUB").
 */
export default function BookCoverDialog({ book, onClose }: Props) {
  const [images, setImages] = useState<BookImage[] | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [hasCover, setHasCover] = useState(true)

  useEffect(() => {
    listBookImages(book.id).then(setImages, () => setImages([]))
  }, [book.id])

  useEffect(() => () => { if (choice?.kind === 'upload') URL.revokeObjectURL(choice.preview) }, [choice])

  const pickFile = (file: File | undefined) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setMessage('Choose a PNG, JPEG or WebP image.'); return }
    if (file.size > 5 * 1024 * 1024) { setMessage('The image is larger than 5 MB.'); return }
    setMessage(null)
    setChoice({ kind: 'upload', file, preview: URL.createObjectURL(file) })
  }

  const save = async () => {
    if (!choice) return
    setSaving(true)
    try {
      const after = choice.kind === 'upload'
        ? { src: await withBusy('Uploading the cover…', () => uploadSuggestionAsset(choice.file)) }
        : { epubPath: choice.image.path }
      const s = buildSuggestion({ kind: 'cover', target: { book: book.title }, before: { src: `/api/library/books/${book.id}/cover` }, after, author: 'user' })
      const r = await saveSuggestion(s)
      setMessage(r.saved
        ? 'Cover suggestion saved. An admin accepts it and writes it into the EPUB in Errors → Suggestions.'
        : `Not saved${r.reason ? `: ${r.reason}` : ''}.`)
    } catch (e) {
      setMessage(`Not saved: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const preview = choice?.kind === 'upload' ? choice.preview : choice?.kind === 'book' ? choice.image.url : null
  return (
    <div role="dialog" aria-modal="true" aria-label={`Cover of ${book.title}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-full w-full max-w-2xl overflow-auto rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cover of {book.title}</h2>
          <button className="text-slate-500 hover:text-slate-800" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <figure>
            <figcaption className="text-xs text-slate-500">Current</figcaption>
            {hasCover
              ? <img src={`/api/library/books/${book.id}/cover`} alt="Current cover" className="h-40 w-32 rounded bg-slate-100 object-contain" onError={() => setHasCover(false)} />
              : <p className="flex h-40 w-32 items-center justify-center rounded bg-slate-100 text-xs text-slate-500">No cover</p>}
          </figure>
          <figure>
            <figcaption className="text-xs text-slate-500">New</figcaption>
            {preview
              ? <img src={preview} alt="New cover" className="h-40 w-32 rounded bg-slate-100 object-contain" />
              : <p className="flex h-40 w-32 items-center justify-center rounded bg-slate-50 text-xs text-slate-400">Choose an image</p>}
          </figure>
        </div>
        <label className="mt-3 block text-sm">
          Upload an image (PNG, JPEG or WebP, at most 5 MB)
          <input type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block text-xs" onChange={(e) => pickFile(e.target.files?.[0])} />
        </label>
        <p className="mt-3 text-sm">Or pick one of the book's images</p>
        {images === null && <p role="status" className="text-xs text-slate-500">Loading the images…</p>}
        {images?.length === 0 && <p className="text-xs text-slate-500">The book has no images.</p>}
        <div className="mt-1 grid max-h-56 grid-cols-4 gap-2 overflow-auto sm:grid-cols-6">
          {(images ?? []).map((img) => (
            <button
              key={img.path}
              type="button"
              aria-label={`Use ${img.path}`}
              aria-pressed={choice?.kind === 'book' && choice.image.path === img.path}
              className={`rounded border p-0.5 ${choice?.kind === 'book' && choice.image.path === img.path ? 'border-blue-600 ring-2 ring-blue-300' : 'border-slate-200'}`}
              onClick={() => setChoice({ kind: 'book', image: img })}
            >
              <img src={img.url} alt="" loading="lazy" className="h-16 w-full object-contain" />
            </button>
          ))}
        </div>
        {message && <p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button className="rounded border border-slate-300 px-3 py-1 text-sm" onClick={onClose}>Close</button>
          <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={!choice || saving} onClick={() => void save()}>Suggest this cover</button>
        </div>
      </div>
    </div>
  )
}

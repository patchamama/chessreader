import { useEffect, useRef, useState } from 'react'
import type { RecognizedGame } from '@chess-ebook/chess-shared'
import { useLlm } from '../../../shared/llm'
import { clearCommentCache } from '../commentdb/commentLookup'
import { generateGuidesForChapter } from '../narration/guideGeneration'
import { EXTRA_AI_TOOLS, summarize, type AiToolEntry } from './aiTools'

interface Props {
  games: RecognizedGame[]
  /** The recognition text of the chapter the games were read from. */
  text: string
  bookId: number | string
  chapter: number
  /** The user may write the guide of a database comment into the database. */
  isAdmin: boolean
  /** The comments of the database quoted in the chapter (text and position). */
  getQuotes?: () => { text: string; fen: string }[]
  /** Engine lines of a position as text (optional, never required). */
  evalsFor?: (fen: string) => Promise<string[] | undefined>
  /** Entries added by the reader on top of the built-in ones. */
  extraEntries?: AiToolEntry[]
  /** Guides were made or changed. */
  onDone?: () => void
}

/**
 * The AI button of the reader toolbar: a menu of what the assistant can do with the chapter,
 * offered only when an AI model is set up (ai-narration-guides S3). Generating the guides walks
 * the paragraphs one by one with a cancellable progress bar in the status footer.
 */
export function AiToolsMenu({ games, text, bookId, chapter, isAdmin, getQuotes, evalsFor, extraEntries = [], onDone }: Props) {
  const llm = useLlm()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  if (!llm.available) return null

  const guides = (redo: boolean) => async () => {
    setMessage('')
    try {
      const result = await generateGuidesForChapter({
        games, text, bookId, chapter, isAdmin, redo, complete: llm.complete,
        ...(getQuotes ? { quotes: getQuotes() } : {}),
        ...(evalsFor ? { evalsFor } : {}),
      })
      if (result.savedToDatabase > 0) clearCommentCache()
      setMessage(summarize(result))
      onDone?.()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  const entries: AiToolEntry[] = [
    { id: 'guides', label: 'Generate narration guides for this chapter', hint: 'Paragraph by paragraph; those that already have one are skipped.', run: guides(false) },
    { id: 'guides-redo', label: 'Regenerate all guides', hint: 'Also the paragraphs that already have a guide.', run: guides(true) },
    ...EXTRA_AI_TOOLS,
    ...extraEntries,
  ]

  return (
    <div ref={box} className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="AI tools"
        aria-label="AI tools"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
      >
        <span aria-hidden="true">✨</span>
      </button>
      {open && (
        <div role="menu" aria-label="AI tools" className="absolute left-0 top-10 z-30 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {entries.map((e) => (
            <button
              key={e.id}
              role="menuitem"
              type="button"
              title={e.hint}
              onClick={() => { setOpen(false); void e.run() }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
      {message && <span role="status" className="max-w-[16rem] truncate text-xs text-slate-600" title={message}>{message}</span>}
    </div>
  )
}

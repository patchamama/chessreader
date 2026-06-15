import { useEffect, useRef, useState } from 'react'
import { countPending, useNotesStore } from './notesStore'
import { fetchNotes, saveNotes } from './notesApi'

interface Props {
  onClose: () => void
}

export function NotesPanel({ onClose }: Props) {
  const content = useNotesStore((s) => s.content)
  const setContent = useNotesStore((s) => s.setContent)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Draft is what the user edits; nothing is persisted until "Save" is pressed.
  const [draft, setDraft] = useState(content)
  const [maximized, setMaximized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Backend is the source of truth: hydrate from it on mount, falling back to
  // the locally cached content (already in the store) if the request fails.
  useEffect(() => {
    let cancelled = false
    fetchNotes()
      .then((remote) => {
        if (cancelled) return
        setContent(remote)
        setDraft(remote)
      })
      .catch(() => {
        /* offline: keep the locally cached draft */
      })
    return () => {
      cancelled = true
    }
  }, [setContent])

  const dirty = draft !== content
  const pending = countPending(draft)

  const insertTask = () => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const before = draft.slice(0, pos)
    const after = draft.slice(pos)
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
    const newContent = before + prefix + '- [ ] ' + after
    setDraft(newContent)
    requestAnimationFrame(() => {
      const newPos = pos + prefix.length + 6
      ta.setSelectionRange(newPos, newPos)
      ta.focus()
    })
  }

  const handleSave = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    try {
      await saveNotes(draft)
      setContent(draft)
    } catch {
      setError('Could not save notes')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (dirty && !window.confirm('You have unsaved notes. Discard them?')) return
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-14 pr-2 pointer-events-none">
      <div
        data-testid="notes-panel"
        className={`pointer-events-auto bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl flex flex-col ${
          maximized ? 'w-[90vw] max-w-5xl max-h-[90vh]' : 'w-96 max-h-[80vh]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Notes</span>
            {pending > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-500 text-[10px] font-bold text-black">
                {pending}
              </span>
            )}
            {dirty && (
              <span
                className="w-2 h-2 rounded-full bg-amber-400"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={insertTask}
              className="text-xs text-zinc-400 hover:text-white border border-zinc-600 hover:border-zinc-400 rounded px-2 py-0.5 transition-colors"
              title="Insert task"
            >
              + task
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="text-xs rounded px-2 py-0.5 transition-colors border border-emerald-600 text-emerald-400 hover:bg-emerald-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-emerald-400"
              title="Save notes"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setMaximized((v) => !v)}
              className="text-zinc-400 hover:text-white transition-colors"
              aria-label={maximized ? 'Restore notes size' : 'Maximize notes'}
              title={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                  <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6" />
                  <path d="M9 21H3v-6" />
                  <path d="M21 3l-7 7" />
                  <path d="M3 21l7-7" />
                </svg>
              )}
            </button>
            <button
              onClick={handleClose}
              className="text-zinc-400 hover:text-white transition-colors text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Editor */}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={'- [ ] pending task\n- [x] done task'}
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 resize-none p-4 outline-none font-mono min-h-[200px]"
          spellCheck={false}
        />

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-700 text-xs flex items-center gap-3">
          {error ? (
            <span className="text-red-400">{error}</span>
          ) : (
            <>
              <span className="text-zinc-500">{pending} pending</span>
              <span className="text-zinc-500">
                {draft.split('\n').filter((l) => /^- \[x\]/i.test(l)).length} done
              </span>
              {dirty && <span className="ml-auto text-amber-400">Unsaved</span>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

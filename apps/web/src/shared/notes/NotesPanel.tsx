import { useRef } from 'react'
import { countPending, useNotesStore } from './notesStore'

interface Props {
  onClose: () => void
}

export function NotesPanel({ onClose }: Props) {
  const content = useNotesStore((s) => s.content)
  const setContent = useNotesStore((s) => s.setContent)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const pending = countPending(content)
  const insertTask = () => {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const before = content.slice(0, pos)
    const after = content.slice(pos)
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
    const newContent = before + prefix + '- [ ] ' + after
    setContent(newContent)
    requestAnimationFrame(() => {
      const newPos = pos + prefix.length + 6
      ta.setSelectionRange(newPos, newPos)
      ta.focus()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-14 pr-2 pointer-events-none">
      <div className="pointer-events-auto w-96 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Notes</span>
            {pending > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-500 text-[10px] font-bold text-black">
                {pending}
              </span>
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
              onClick={onClose}
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
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={'- [ ] pending task\n- [x] done task'}
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 resize-none p-4 outline-none font-mono min-h-[200px]"
          spellCheck={false}
        />

        {/* Footer */}
        {content.trim() && (
          <div className="px-4 py-2 border-t border-zinc-700 text-xs text-zinc-500 flex gap-3">
            <span>{pending} pending</span>
            <span>{content.split('\n').filter((l) => /^- \[x\]/i.test(l)).length} done</span>
          </div>
        )}
      </div>
    </div>
  )
}

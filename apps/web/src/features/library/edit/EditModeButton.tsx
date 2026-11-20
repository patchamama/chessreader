/** The reader's pencil: turns edit mode on and off (S8). */
export function EditModeButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label="Edit mode"
      title={active ? 'Leave edit mode' : 'Edit mode: insert content or correct a paragraph'}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border shadow-sm transition ${active ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
    >
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 16.536 8 18l1.464-4.536z" />
      </svg>
    </button>
  )
}

/** How a suggestion made this session looks in the chapter until it is accepted. */
export const PENDING_SUGGESTION_CSS = `
.pending-suggestion { outline: 2px dashed #f59e0b; outline-offset: 2px; position: relative; display: block; }
span.pending-suggestion { display: inline; }
div.pending-suggestion::before { content: 'pending'; position: absolute; top: -0.6rem; right: 0; font-size: 10px; line-height: 1; padding: 2px 4px; border-radius: 4px; background: #f59e0b; color: #fff; font-family: system-ui, sans-serif; }
span.pending-suggestion::after { content: 'pending'; margin-left: 4px; font-size: 10px; padding: 1px 4px; border-radius: 4px; background: #f59e0b; color: #fff; font-family: system-ui, sans-serif; }
`

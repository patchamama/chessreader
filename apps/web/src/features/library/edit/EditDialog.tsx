import { useEffect, type ReactNode } from 'react'

/** The panel of an edit-mode action: a modal dialog closed with Escape or its × button. */
export function EditDialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div role="dialog" aria-modal="true" aria-label={label} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">{label}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded px-2 text-lg text-slate-500 hover:bg-slate-100">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

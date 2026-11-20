import { useState } from 'react'

/** A Hide button with a confirmation step (S17, S21: comments are hidden, never deleted); the error of a failed hide shows inline. */
export default function DeleteControl({ onConfirm, label = 'Hide', className = '' }: { onConfirm: () => Promise<void>; label?: string; className?: string }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const btn = 'rounded border px-2 py-0.5 text-xs disabled:opacity-40'
  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  if (!asking) return <button className={`${btn} border-red-300 text-red-700 ${className}`} onClick={() => setAsking(true)}>{label}</button>
  return (
    <span role="group" aria-label="Confirm hide" className="inline-flex flex-wrap items-center gap-1 text-xs">
      <span className="text-red-700">Hide this comment? It stays in the database but is no longer shown.</span>
      <button className={`${btn} border-red-700 bg-red-700 text-white`} disabled={busy} onClick={() => void confirm()}>Yes, hide</button>
      <button className={`${btn} border-slate-300`} disabled={busy} onClick={() => { setAsking(false); setError(null) }}>Keep</button>
      {error && <span role="alert" className="text-red-700">{error}</span>}
    </span>
  )
}

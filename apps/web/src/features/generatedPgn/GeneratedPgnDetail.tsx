import { useMemo, useState } from 'react'
import ChessBoard from '../../shared/chess/ChessBoard'
import { saveFile } from './download'
import type { GeneratedPgnClient, GeneratedPgnItem, PgnStatus } from './generatedPgnApi'
import LichessUploadPanel from './LichessUploadPanel'
import { pgnPositions } from './pgnPositions'

const STATUS_LABEL: Record<PgnStatus, string> = { new: 'New', reviewed: 'Reviewed', rejected: 'Rejected' }

/** One generated game: the board, the editable PGN, its review status, the download and the Lichess upload. */
export default function GeneratedPgnDetail({ item, client, canWrite, onChange, onDelete }: {
  item: GeneratedPgnItem
  client: GeneratedPgnClient
  canWrite: boolean
  onChange: (item: GeneratedPgnItem) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState(item.pgn)
  const [ply, setPly] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const positions = useMemo(() => pgnPositions(draft), [draft])
  const at = positions ? positions[Math.min(ply, positions.length - 1)] : null
  const last = positions ? positions.length - 1 : 0
  const dirty = draft !== item.pgn

  const patch = async (p: Parameters<GeneratedPgnClient['update']>[1]) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await client.update(item.id, p))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const btn = 'rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50'
  const name = `${item.white || 'game'}-${item.black || ''}`.replace(/[\\/:*?"<>|]+/g, '').trim() || 'game'

  return (
    <div aria-label="Generated game" className="mt-3 rounded border border-slate-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{item.white || '?'} – {item.black || '?'} <span className="font-normal text-slate-500">{item.result} · {item.bookTitle}, chapter {item.chapter}</span></h3>
        <span className="text-xs text-slate-600">Status: <strong>{STATUS_LABEL[item.status]}</strong>{item.lichessUrl && <> · <a className="underline" href={item.lichessUrl} target="_blank" rel="noopener noreferrer">on Lichess</a></>}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        <div className="w-64 shrink-0">
          {positions && at ? (
            <>
              <ChessBoard fen={at.fen} orientation="white" lastMove={at.from && at.to ? { from: at.from, to: at.to } : null} />
              <div className="mt-1 flex items-center justify-center gap-1 text-xs">
                <button type="button" className={btn} aria-label="First position" onClick={() => setPly(0)} disabled={ply === 0}>«</button>
                <button type="button" className={btn} aria-label="Previous move" onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0}>‹</button>
                <span aria-live="polite" className="w-16 text-center">{ply}/{last}{at.san ? ` ${at.san}` : ''}</span>
                <button type="button" className={btn} aria-label="Next move" onClick={() => setPly((p) => Math.min(last, p + 1))} disabled={ply >= last}>›</button>
                <button type="button" className={btn} aria-label="Last position" onClick={() => setPly(last)} disabled={ply >= last}>»</button>
              </div>
            </>
          ) : <p role="alert" className="text-xs text-red-600">This PGN cannot be played: fix its moves to see the board.</p>}
        </div>
        <div className="min-w-[16rem] flex-1">
          <textarea aria-label="PGN" value={draft} readOnly={!canWrite} onChange={(e) => { setDraft(e.target.value); setPly(0) }} rows={12} className="w-full rounded border border-slate-300 p-1 font-mono text-xs" />
          <div className="mt-1 flex flex-wrap gap-2">
            {canWrite && <button type="button" className={btn} disabled={busy || !dirty || draft.trim() === ''} onClick={() => void patch({ pgn: draft })}>Save changes</button>}
            {canWrite && <button type="button" className={btn} disabled={busy || item.status === 'reviewed'} onClick={() => void patch({ status: 'reviewed' })}>Accept</button>}
            {canWrite && <button type="button" className={btn} disabled={busy || item.status === 'rejected'} onClick={() => void patch({ status: 'rejected' })}>Reject</button>}
            {canWrite && <button type="button" className={btn} disabled={busy || item.status === 'new'} onClick={() => void patch({ status: 'new' })}>Mark as new</button>}
            <button type="button" className={btn} onClick={() => saveFile(`${name}.pgn`, draft.endsWith('\n') ? draft : `${draft}\n`, 'application/x-chess-pgn')}>Download PGN</button>
            {canWrite && <button type="button" className={`${btn} text-red-700`} disabled={busy} onClick={onDelete}>Delete</button>}
          </div>
          {!canWrite && <p className="mt-1 text-xs text-slate-500">Only the person who generated this game, or an admin, can change it.</p>}
          {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
      {canWrite && <LichessUploadPanel item={{ ...item, pgn: draft }} client={client} onUploaded={(url) => onChange({ ...item, lichessUrl: url })} />}
    </div>
  )
}

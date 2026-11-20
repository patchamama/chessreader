import type { BatchProgress } from '../comments/commentAi'

const downloadHref = (json: string) => `data:application/json;charset=utf-8,${encodeURIComponent(json)}`

/** Progress of a whole comments batch (S1): done/total, skipped, saved, flagged, failed, with a cancel while it runs. */
export default function BatchProgressBar({ progress, running, onCancel }: { progress: BatchProgress; running: boolean; onCancel: () => void }) {
  const { done, total } = progress
  return (
    <div data-testid="batch-progress" role="status" className="basis-full text-xs">
      <div className="flex items-center gap-2">
        <progress role="progressbar" aria-label="Batch progress" className="h-2 flex-1" value={done} max={Math.max(total, 1)} aria-valuenow={done} aria-valuemax={total} />
        {running && <button className="rounded border border-slate-300 px-2 py-0.5" aria-label="Cancel batch" onClick={onCancel}>Cancel</button>}
      </div>
      <p>
        {done}/{total} · {progress.skipped} skipped · <span>{`${progress.saved} saved · ${progress.flagged} flagged · ${progress.failed} failed`}</span>
        {progress.cancelled ? ' (cancelled)' : ''}{running ? ' …' : ''}
        {progress.unsaved.length > 0 && <> · <a className="underline" href={downloadHref(`[${progress.unsaved.join(',\n')}]`)} download="suggestions.json">Download {progress.unsaved.length} not stored</a></>}
      </p>
    </div>
  )
}

import { useInstallStockfish, useSelectStockfish, useStockfishStatus, type StockfishRelease } from '../api/adminApi'

const date = (iso: string) => iso.slice(0, 10)
const button = 'rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'

/**
 * The Stockfish the server runs: the latest release on GitHub (checked once a
 * day), whether it is installed, the releases that can be downloaded, and the
 * version in use (the system binary until another is chosen).
 */
export default function StockfishPanel() {
  const { data, isLoading, error } = useStockfishStatus()
  const install = useInstallStockfish()
  const select = useSelectStockfish()
  if (isLoading) return <p className="text-sm text-slate-500">Checking Stockfish releases…</p>
  if (error || !data) return <p role="alert" className="text-sm text-red-700">Could not read the server engine: {String((error as Error)?.message ?? 'no answer')}</p>

  const nameOf = (tag: string) => data.releases.find((r) => r.tag === tag)?.name ?? tag
  const row = (r: StockfishRelease) => {
    const installed = data.installed.includes(r.tag)
    return (
      <li key={r.tag} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-sm">
        <span>
          {r.name} <span className="text-xs text-slate-500">({date(r.publishedAt)}{r.prerelease ? ', development build' : ''})</span>
        </span>
        {installed ? <span className="text-xs text-emerald-700">installed</span>
          : r.available ? <button className={button} disabled={install.isPending} onClick={() => install.mutate(r.tag)}>Download {r.name}</button>
          : <span className="text-xs text-slate-400">no build for this server</span>}
      </li>
    )
  }

  return (
    <section aria-label="Server engine" className="space-y-3">
      {data.latest && (
        <p className="text-sm">
          <strong>{data.latest.name} is the latest release</strong> ({date(data.latest.publishedAt)})
          {data.latestInstalled ? <span className="ml-1 text-emerald-700">— installed.</span> : <span className="ml-1 text-amber-700">— not installed on this server.</span>}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        Engine in use
        <select aria-label="Engine in use" className="rounded border border-slate-300 bg-white px-2 py-1 text-sm" value={data.selected}
          disabled={select.isPending} onChange={(e) => select.mutate(e.target.value)}>
          <option value="system">System Stockfish{data.system ? ` (${data.system})` : ' (none found)'}</option>
          {data.installed.map((tag) => <option key={tag} value={tag}>{nameOf(tag)}</option>)}
        </select>
      </label>
      {install.isPending && <p role="status" className="text-xs text-slate-500">Downloading… (about 80 MB)</p>}
      {(install.error || select.error) && <p role="alert" className="text-xs text-red-700">{String(((install.error ?? select.error) as Error).message)}</p>}
      <ul className="flex flex-col gap-1">{data.releases.map(row)}</ul>
      <p className="text-xs text-slate-500">The browser engine is chosen per user in Settings; this is the engine of the server (reviews, diagrams).</p>
    </section>
  )
}

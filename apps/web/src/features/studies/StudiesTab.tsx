import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { withBusy } from '../../shared/layout/busyStore'
import RatingStars from './RatingStars'
import { parseRefs, runImport, type ImportEvent } from './importRunner'
import { openStudyBook, type OpenMode, type StudyPart } from './openStudy'
import StudyToBookModal from './toBook/StudyToBookModal'
import { filterStudies, nextSort, sortedRows, type SortDir, type SortKey } from './studiesList'
import { studiesApi, type StudiesClient, type Study, type StudyAuthor, type UserStudy } from './studiesApi'

const COLUMNS: [SortKey, string][] = [['name', 'name'], ['author', 'author'], ['rating', 'my rating'], ['likes', 'likes'], ['updated', 'updated'], ['imported', 'imported']]
const day = (v: string | number | null) => (v === null || v === '' ? '—' : new Date(v).toISOString().slice(0, 10))
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

function LikesInput({ study, onSave }: { study: Study; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(study.lichessLikes === null ? '' : String(study.lichessLikes))
  const commit = () => {
    const n = v.trim() === '' ? null : Math.max(0, Math.floor(Number(v)))
    if (n !== null && Number.isNaN(n)) return
    if (n !== study.lichessLikes) onSave(n)
  }
  return (
    <input type="number" min={0} aria-label={`Lichess likes of ${study.name}`} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit}
      title="The Lichess API does not expose the number of likes: fill it in by hand." className="w-16 rounded border border-slate-300 px-1 text-xs" />
  )
}

const TOKEN_URL = 'https://lichess.org/account/oauth/token/create?scopes[]=study:read&description=Chess+ebook+studies'

/** Optional Lichess token; lives in component state only. */
function TokenField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <label className="flex items-center gap-1">Lichess token (optional — only for private studies you can open with your account; scope study:read)
        <input type="password" autoComplete="off" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="w-56 rounded border border-slate-300 px-1" />
      </label>
      <a className="underline" href={TOKEN_URL} target="_blank" rel="noopener noreferrer">Create a token</a>
      <button type="button" className="rounded border border-slate-300 px-2" onClick={() => onChange('')}>Forget</button>
    </div>
  )
}

/** Database → Studies: the imported Lichess studies, their import and opening as books. */
export default function StudiesTab({ client = studiesApi }: { client?: StudiesClient }) {
  const navigate = useNavigate()
  const [studies, setStudies] = useState<Study[] | null>(null)
  const [authors, setAuthors] = useState<StudyAuthor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  // import
  const [links, setLinks] = useState('')
  const [follow, setFollow] = useState(false)
  const [partsText, setPartsText] = useState('')
  const [lines, setLines] = useState<string[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const cancelled = useRef(false)
  const [token, setToken] = useState('')
  const [needToken, setNeedToken] = useState<string[]>([])
  const tokenOpt = () => (token.trim() ? { token: token.trim() } : {})
  // author listing
  const [handle, setHandle] = useState('')
  const [userStudies, setUserStudies] = useState<UserStudy[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // "Add to library as a book"
  const [converting, setConverting] = useState<{ study: Study; parts: StudyPart[] } | null>(null)
  const [bookMsg, setBookMsg] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const r = await client.list()
      setStudies(r.studies); setAuthors(r.authors); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [client])
  useEffect(() => { void reload() }, [reload])

  const rows = useMemo(() => sortedRows(filterStudies(studies ?? [], text, author), sort.key, sort.dir), [studies, text, author, sort])
  const patch = (s: Study) => setStudies((cur) => (cur ?? []).map((x) => (x.id === s.id ? { ...x, ...s } : x)))
  const save = async (s: Study, p: { myRating?: number | null; lichessLikes?: number | null }) => {
    try { patch(await client.update(s.id, p)) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const open = (id: string, name: string, mode: OpenMode, parts?: Study[]) => withBusy('Opening the study', async () => {
    try {
      const members = parts && parts.length > 1 ? parts : [{ id, name } as Study]
      const loaded: StudyPart[] = []
      for (const m of members) loaded.push({ name: m.name, pgn: (await client.get(m.id)).pgn })
      navigate(openStudyBook(loaded, mode, name))
      setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  })

  const startConvert = (s: Study, parts?: Study[]) => withBusy('Loading the study', async () => {
    try {
      const members = parts && parts.length > 1 ? parts : [s]
      const loaded: StudyPart[] = []
      for (const m of members) loaded.push({ name: m.name, pgn: (await client.get(m.id)).pgn })
      setBookMsg(null); setError(null); setConverting({ study: s, parts: loaded })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  })

  const remove = async (s: Study, parts: Study[]) => {
    if (!window.confirm(`Delete the study "${s.name}"?`)) return
    const others = parts.filter((p) => p.id !== s.id).length
    const withGroup = others > 0 && window.confirm(`Also delete its ${plural(others, 'other part')}?`)
    try { await client.remove(s.id, withGroup); await reload() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const sync = async () => {
    try {
      const r = await client.syncComments()
      setSyncMsg(`${r.added} added (${plural(r.studies, 'study')} in the commentary database)`)
      await reload()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const describe = (e: ImportEvent): string | null => {
    switch (e.type) {
      case 'start': return `… ${e.id} (${e.index}/${e.total})`
      case 'wait': return `Lichess asks to wait ${e.seconds} s, then ${e.id} is retried`
      case 'error': return `⚠ ${e.id}: ${e.message}`
      case 'done': return [
        `✓ ${e.id}: imported ${plural(e.result.imported.length, 'study').replace(/study$/, 'study').replace('studys', 'studies')}`,
        ...e.result.skipped.map((s) => `skipped ${s.id}: ${s.reason}`),
        ...e.result.errors.map((x) => (x.needsToken ? `${x.id}: 🔒 private — add a Lichess token above and import again` : `⚠ ${x.id}: ${x.message}`)),
      ].join('; ')
    }
  }

  const startImport = async (refs: string[], base: { follow?: boolean; parts?: string[] }) => {
    if (!refs.length || importing) return
    cancelled.current = false
    setImporting(true); setLines([]); setSummary(null); setNeedToken([])
    const options = { ...base, ...tokenOpt() }
    const sum = await runImport(client, refs, options, (e) => {
      if (e.type === 'done') { const ids = e.result.errors.filter((x) => x.needsToken).map((x) => x.id); if (ids.length) setNeedToken((cur) => [...cur, ...ids]) }
      const l = describe(e)
      if (l) setLines((cur) => (e.type === 'start' ? [...cur, l] : [...cur.slice(0, e.type === 'wait' ? cur.length : -1), l]))
    }, { isCancelled: () => cancelled.current })
    setImporting(false)
    const n = sum.imported
    setSummary(`Imported ${n === 1 ? '1 study' : `${n} studies`}, ${sum.skipped} skipped, ${plural(sum.errors, 'error')}${sum.cancelled ? ' (cancelled)' : ''}`)
    await reload()
  }

  const importLinks = () => {
    const parts = parseRefs(partsText)
    void startImport(parseRefs(links), { ...(follow ? { follow: true } : {}), ...(parts.length ? { parts } : {}) })
  }

  const listUser = async () => {
    try {
      const r = await client.listUser(handle.trim().replace(/^@/, ''), token.trim() || undefined)
      setUserStudies(r.studies); setPicked(new Set()); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const header = (k: SortKey, label: string) => (
    <th key={k} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="font-semibold" aria-label={`Sort by ${label}`} onClick={() => setSort((c) => nextSort(c, k))}>{label}{sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
    </th>
  )

  return (
    <div className="space-y-4 text-sm">
      {error && <p role="alert" className="rounded bg-red-50 p-2 text-red-700">{error}</p>}
      {bookMsg && <p role="status" className="rounded bg-green-50 p-2 text-green-800">{bookMsg}</p>}
      {converting && <StudyToBookModal study={converting.study} parts={converting.parts} onClose={() => setConverting(null)} onAdded={setBookMsg} />}

      <section aria-label="Import studies" className="rounded border border-slate-200 p-3">
        <h2 className="font-semibold text-slate-700">Import studies</h2>
        <textarea aria-label="Study links" rows={3} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Lichess study links or ids, separated by spaces or new lines"
          className="mt-1 w-full rounded border border-slate-300 p-1 text-xs" />
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />Follow links to other parts (book)</label>
          <label className="flex items-center gap-1">Parts <input aria-label="Parts" value={partsText} onChange={(e) => setPartsText(e.target.value)} placeholder="extra part links or ids (optional)" className="w-64 rounded border border-slate-300 px-1" /></label>
          <button className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50" disabled={importing || !parseRefs(links).length} onClick={importLinks}>Import</button>
          {importing && <button className="rounded border border-slate-300 px-2 py-1" onClick={() => { cancelled.current = true }}>Cancel</button>}
        </div>
        <TokenField label="Lichess token for import" value={token} onChange={setToken} />
        {needToken.length > 0 && !importing && (
          <button className="mt-1 rounded border border-amber-400 px-2 py-0.5 text-xs" onClick={() => void startImport(needToken, {})}>Retry with token</button>
        )}
        {(lines.length > 0 || summary) && (
          <div aria-live="polite" className="mt-2 text-xs">
            <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            {summary && <p className="mt-1 font-semibold">{summary}</p>}
          </div>
        )}
      </section>

      <section aria-label="Studies of an author" className="rounded border border-slate-200 p-3">
        <h2 className="font-semibold text-slate-700">Studies of a Lichess author</h2>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <input aria-label="Lichess handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" className="rounded border border-slate-300 px-1 py-0.5" />
          <button className="rounded border border-slate-300 px-2 py-0.5" disabled={!handle.trim()} onClick={() => void listUser()}>List studies</button>
        </div>
        <TokenField label="Lichess token for author listing" value={token} onChange={setToken} />
        {userStudies && (
          <div className="mt-2">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th /><th>Name</th><th>Updated</th><th>Imported</th><th /></tr></thead>
              <tbody>
                {userStudies.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td><input type="checkbox" aria-label={`Select ${u.name}`} checked={picked.has(u.id)} onChange={(e) => setPicked((c) => { const n = new Set(c); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n })} /></td>
                    <td>{u.name}</td><td>{day(u.updatedAt)}</td><td>{u.imported ? '✓' : ''}</td>
                    <td>{u.imported && <button className="underline" aria-label={`Open ${u.name}`} onClick={() => void open(u.id, u.name, 'continuous')}>Open</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mt-1 rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50" disabled={!picked.size || importing} onClick={() => void startImport([...picked], {})}>Import selected</button>
          </div>
        )}
      </section>

      <section aria-label="Imported studies">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <input aria-label="Filter studies" value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by name or author" className="rounded border border-slate-300 px-1 py-0.5" />
          <label className="flex items-center gap-1">Author
            <select aria-label="Author" value={author} onChange={(e) => setAuthor(e.target.value)} className="rounded border border-slate-300 px-1">
              <option value="">All</option>
              {authors.map((a) => <option key={a.author} value={a.author}>{a.author} ({a.count})</option>)}
            </select>
          </label>
          <button className="rounded border border-slate-300 px-2 py-0.5" onClick={() => void sync()}>Sync from commentary database</button>
          {syncMsg && <span>{syncMsg}</span>}
        </div>
        {studies && !rows.length && <p className="text-slate-500">No studies yet. Import some above.</p>}
        {rows.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                {COLUMNS.slice(0, 2).map(([k, l]) => header(k, l))}
                <th>Chapters / games / comments</th>
                {COLUMNS.slice(2).map(([k, l]) => header(k, l))}
                <th>Source</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.flatMap(({ study: s, parts }) => {
                const grouped = parts.length > 1
                const open_ = expanded.has(s.id)
                const book = s.isBook || grouped
                const total = (f: (p: Study) => number) => (grouped ? parts : [s]).reduce((n, p) => n + f(p), 0)
                const main = (
                  <tr key={s.id} className="border-t border-slate-100 align-top">
                    <td>
                      {book && <span title={`Book made of linked parts${grouped ? ` (${plural(parts.length, 'part')})` : ''}`} aria-label="Book">📖 </span>}
                      <span data-testid="study-name" className="font-medium">{s.name}</span>
                      {grouped && <button className="ml-1 underline" aria-label={`Show parts of ${s.name}`} aria-expanded={open_} onClick={() => setExpanded((c) => { const n = new Set(c); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })}>{open_ ? '▾' : '▸'} {plural(parts.length, 'part')}</button>}
                    </td>
                    <td>{s.author ?? '—'}</td>
                    <td>{total((p) => p.chapters)} / {total((p) => p.games)} / {total((p) => p.comments)}</td>
                    <td><RatingStars value={s.myRating} label={`My rating of ${s.name}`} onChange={(v) => void save(s, { myRating: v })} /></td>
                    <td><LikesInput study={s} onSave={(v) => void save(s, { lichessLikes: v })} /></td>
                    <td>{day(s.updatedAt)}</td><td>{day(s.importedAt)}</td>
                    <td><span className="rounded bg-slate-100 px-1">{s.source === 'comments' ? 'commentary DB' : 'Lichess'}</span></td>
                    <td className="whitespace-nowrap">
                      <button className="rounded border border-slate-300 px-1" aria-label={`Open ${s.name} as a continuous book`} onClick={() => void open(s.id, s.name, 'continuous', grouped ? parts : undefined)}>Open as book</button>{' '}
                      <button className="rounded border border-slate-300 px-1" aria-label={`Open ${s.name} with one chapter per game`} onClick={() => void open(s.id, s.name, 'per-game', grouped ? parts : undefined)}>One chapter per game</button>{' '}
                      <button className="rounded border border-slate-300 px-1" aria-label={`Add ${s.name} to the library as a book`} title="Convert the study into an EPUB and add it to your library" onClick={() => void startConvert(s, grouped ? parts : undefined)}>Add to library</button>{' '}
                      <button className="rounded border border-red-300 px-1 text-red-700" aria-label={`Delete ${s.name}`} onClick={() => void remove(s, parts)}>Delete</button>
                    </td>
                  </tr>
                )
                const partRows = grouped && open_ ? parts.map((p) => (
                  <tr key={`${s.id}-${p.id}`} className="bg-slate-50 text-slate-600"><td className="pl-6" colSpan={9}>{p.partOrder ?? ''} {p.name} · {plural(p.games, 'game')}</td></tr>
                )) : []
                return [main, ...partRows]
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

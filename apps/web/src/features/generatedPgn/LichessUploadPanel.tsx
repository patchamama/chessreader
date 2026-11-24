import { useState } from 'react'
import type { GeneratedPgnClient, GeneratedPgnItem } from './generatedPgnApi'

const TOKEN_URL = 'https://lichess.org/account/oauth/token/create?scopes[]=study:write&description=Chess+ebook+generated+PGN'

/**
 * Lichess side of a generated PGN. The public Lichess API can only IMPORT a PGN
 * into a study that already exists (scope study:write) and cannot create a study
 * or set its visibility, so that is exactly what this offers, and says so.
 * The token lives in this component only: it is sent with the one request.
 */
export default function LichessUploadPanel({ item, client, onUploaded }: { item: GeneratedPgnItem; client: GeneratedPgnClient; onUploaded: (url: string) => void }) {
  const [study, setStudy] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'public'>('private')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ url: string; chapters: number; note: string } | null>(null)

  const upload = async () => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const r = await client.uploadToLichess(item.id, { studyId: study.trim(), visibility, token: token.trim() })
      setDone({ url: r.url, chapters: r.chapters.length, note: r.note })
      onUploaded(r.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setToken('')
      setBusy(false)
    }
  }
  const copy = () => void navigator.clipboard?.writeText(item.pgn).catch(() => undefined)

  return (
    <section aria-label="Lichess" className="mt-3 rounded border border-slate-200 p-2 text-xs">
      <h3 className="font-semibold text-slate-700">Lichess</h3>
      <p className="mt-1 text-slate-600">
        Lichess lets an app add a PGN only to a study that <strong>already exists</strong> (it adds the games as new chapters). The API cannot create a study or
        change whether it is private or public: create the study on Lichess, choose its visibility there, then paste its link or id here.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col">Study link or id
          <input aria-label="Lichess study link or id" value={study} onChange={(e) => setStudy(e.target.value)} placeholder="https://lichess.org/study/AbCdEfGh" className="w-64 rounded border border-slate-300 px-1" />
        </label>
        <label className="flex flex-col">Intended visibility
          <select aria-label="Intended visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as 'private' | 'public')} className="rounded border border-slate-300 px-1">
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </label>
        <label className="flex flex-col">Lichess token (study:write)
          <input type="password" autoComplete="off" aria-label="Lichess token with study:write" value={token} onChange={(e) => setToken(e.target.value)} className="w-48 rounded border border-slate-300 px-1" />
        </label>
        <button type="button" disabled={busy || !study.trim() || !token.trim()} onClick={() => void upload()} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50">Add to the study</button>
      </div>
      <p className="mt-1 text-slate-500">
        The token is sent with this request only: it is not saved or logged, and it is cleared after the call. <a className="underline" href={TOKEN_URL} target="_blank" rel="noopener noreferrer">Create a token</a>.
        The visibility chosen here is only a reminder: it is not applied by Lichess.
      </p>
      {error && <p role="alert" className="mt-1 text-red-600">{error}</p>}
      {done && (
        <p role="status" className="mt-1 text-emerald-700">
          Added {done.chapters} chapter{done.chapters === 1 ? '' : 's'} to <a className="underline" href={done.url} target="_blank" rel="noopener noreferrer">{done.url}</a>. {done.note}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-slate-500">Or by hand:</span>
        <button type="button" onClick={copy} className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50">Copy PGN</button>
        <a className="underline" href="https://lichess.org/study" target="_blank" rel="noopener noreferrer">Open Lichess studies</a>
        <span className="text-slate-500">(in a study: “Add chapter” → “PGN”, paste)</span>
      </div>
    </section>
  )
}

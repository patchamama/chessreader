import { useState } from 'react'
import { useLlm } from '../../shared/llm'
import { fixLabel, parseRank, plyLabel, previewFix, RANK_SYSTEM } from '../library/wrongMove/wrongMove'
import { rankQuestion, saveWrongMoveFix, type FixSaveResult } from '../library/wrongMove/gameFix'
import type { WrongMoveBatch, WrongMoveRow } from './wrongMoveBatch'

type Rank = { best: number; reason: string } | 'asking' | 'bad'

const NO_BOOK = 'This correction cannot be filed for this book.'

/** The fix a row saves: the AI's pick when it ranked them, else the top one. */
const chosen = (row: WrongMoveRow, rank: Rank | undefined) => row.result.fixes[rank && typeof rank === 'object' ? rank.best : 0]

/**
 * The results of "Find the wrong moves": per game the failing ply and the top
 * fix, a preview of how much of the game it reads, saving it (errata for a
 * substitution, a 'move' suggestion for the others), an optional AI ranking,
 * and saving every complete fix at once. Nothing is applied to the book.
 */
export function WrongMovesBatch({ title, batch, onClose }: { title: string; batch: WrongMoveBatch; onClose: () => void }) {
  const llm = useLlm()
  const [previews, setPreviews] = useState<Record<string, { read: number; total: number }>>({})
  const [ranks, setRanks] = useState<Record<string, Rank>>({})
  const [saved, setSaved] = useState<Record<string, FixSaveResult | 'saving'>>({})
  const [savingAll, setSavingAll] = useState(false)
  const rows = batch.rows
  const complete = rows.filter((r) => chosen(r, ranks[r.key])?.complete)

  const save = async (row: WrongMoveRow) => {
    const fix = chosen(row, ranks[row.key])
    if (!fix) return
    setSaved((s) => ({ ...s, [row.key]: 'saving' }))
    const r = await saveWrongMoveFix(fix, { moves: row.moves, gameIndex: row.gameIndex, errataFor: row.errataFor, target: row.target, noBook: NO_BOOK })
    setSaved((s) => ({ ...s, [row.key]: r }))
  }
  const saveAll = async () => {
    setSavingAll(true)
    for (const row of complete) {
      const s = saved[row.key]
      if (s === 'saving' || (s && s.ok)) continue
      await save(row)
    }
    setSavingAll(false)
  }
  const askAi = async (row: WrongMoveRow) => {
    const question = rankQuestion(row.moves, row.text, row.result)
    if (!question) return
    setRanks((r) => ({ ...r, [row.key]: 'asking' }))
    let rank: Rank = 'bad'
    try {
      const answer = await llm.complete({ system: RANK_SYSTEM, messages: [{ role: 'user', text: question }], json: true, maxTokens: 400 })
      rank = parseRank(answer.text, row.result.fixes.length) ?? 'bad'
    } catch { /* shown as unreadable */ }
    setRanks((r) => ({ ...r, [row.key]: rank }))
  }

  const cell = 'border-t border-slate-100 px-2 py-1 align-top'
  const button = 'rounded border border-slate-300 px-2 py-0.5 disabled:opacity-40'
  return (
    <section className="mt-6" aria-label="Wrong moves">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Wrong moves: {title}</h2>
        <span data-testid="wrong-moves-summary" className="text-xs text-slate-500">
          {batch.checked} games with errors checked · {rows.length} with a wrong move · {complete.length} with a complete fix
        </span>
        {batch.stopped && <span role="status" className="text-xs text-amber-700">Stopped: the results are partial.</span>}
        <button className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50" disabled={complete.length === 0 || savingAll} onClick={() => void saveAll()}>
          Save all complete fixes
        </button>
        <button className="text-xs underline" onClick={onClose}>Close</button>
      </div>
      <p className="text-xs text-slate-500">Nothing is applied to the book: saved fixes go to the errata or the suggestions to review.</p>
      <table className="mt-1 w-full text-xs" aria-label="Wrong moves found">
        <thead><tr className="text-left text-slate-500"><th className="px-2">Game</th><th>Fails at</th><th>Top fix</th><th>Later moves</th><th /><th /></tr></thead>
        <tbody>
          {rows.map((row) => {
            const rank = ranks[row.key]
            const fix = chosen(row, rank)
            const f = row.result.failingPly!
            const preview = previews[row.key]
            const s = saved[row.key]
            return (
              <tr key={row.key}>
                <td className={cell}>{row.bookTitle} · ch. {row.chapter} · {row.label}</td>
                <td className={`${cell} font-mono`}>{plyLabel(f)} {row.moves[f]?.source?.written ?? row.moves[f]?.san}</td>
                <td className={`${cell} font-mono`}>
                  {fix ? fixLabel(fix) : 'No single fix'}
                  {rank === 'asking' && <span role="status" className="block font-sans">Asking the AI…</span>}
                  {rank === 'bad' && <span role="status" className="block font-sans text-red-700">The AI answer could not be read.</span>}
                  {rank && typeof rank === 'object' && (
                    <span data-testid="wrong-move-ai" className="block rounded bg-violet-50 px-1 font-sans text-violet-900">AI pick: {fixLabel(row.result.fixes[rank.best])}. {rank.reason}</span>
                  )}
                  {preview && <span data-testid="wrong-move-preview" className="block font-sans text-slate-600">{f} → {preview.read} of {preview.total} moves read</span>}
                </td>
                <td className={cell}>
                  {fix ? `${fix.playedAfter} later moves play` : ''}
                  {fix?.complete && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold uppercase text-emerald-800">complete</span>}
                </td>
                <td className={cell}>
                  {s && s !== 'saving' && (s.ok ? <span>Saved: <code>{s.path}</code></span> : 'path' in s ? (
                    <details>
                      <summary>Not saved: add this JSON to the resources repository at <code>{s.path}</code>{s.reason ? ` (${s.reason})` : ''}</summary>
                      <textarea readOnly value={s.json} rows={6} aria-label="JSON" className="mt-1 w-full rounded border border-slate-300 p-1 font-mono text-[11px]" />
                    </details>
                  ) : <span>{s.reason}</span>)}
                </td>
                <td className={`${cell} whitespace-nowrap`}>
                  <span className="flex gap-1">
                    <button className={button} disabled={!fix} onClick={() => fix && setPreviews((p) => ({ ...p, [row.key]: previewFix(row.moves.map((m) => m.san), fix, row.startFen) }))}>Preview</button>
                    <button className={button} disabled={!fix || s === 'saving'} onClick={() => void save(row)}>Save</button>
                    {llm.available && row.result.fixes.length > 0 && (
                      <button className={button} disabled={rank === 'asking'} onClick={() => void askAi(row)}>Ask the AI to rank</button>
                    )}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

import { useMemo, useState } from 'react'
import { PROMPT_CATALOG, type PromptEntry } from './promptCatalog'

/** The text of a prompt as sent: system, then each message. */
function promptText(entry: PromptEntry): { system: string; user: string } {
  const request = entry.build()
  return { system: request.system ?? '', user: request.messages.map((m) => m.text + (m.images?.length ? `\n[${m.images.length} image(s)]` : '')).join('\n\n') }
}

const clip = (text: string) => { try { void navigator.clipboard?.writeText(text) } catch { /* no clipboard */ } }

/** Every prompt the app sends to an AI model, by situation; searchable, groups collapsible, each copyable. */
export function PromptsModal({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const items = useMemo(() => PROMPT_CATALOG.map((entry) => ({ entry, ...promptText(entry) })), [])
  const needle = filter.trim().toLowerCase()
  const shown = items.filter((i) => !needle || [i.entry.title, i.entry.situation, i.entry.group, i.system, i.user, i.entry.answer].join('\n').toLowerCase().includes(needle))
  const groups = [...new Set(shown.map((i) => i.entry.group))]
  const toggle = (g: string) => setClosed((c) => { const n = new Set(c); if (!n.delete(g)) n.add(g); return n })

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-label="All AI prompts" className="flex max-h-full w-full max-w-3xl flex-col rounded bg-white text-gray-900 shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-200 p-3">
          <h2 className="flex-1 text-sm font-bold">All AI prompts ({shown.length})</h2>
          <input aria-label="Filter prompts" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs" />
          <button aria-label="Close" className="px-2 text-lg leading-none" onClick={onClose}>×</button>
        </div>
        <div className="overflow-y-auto p-3 text-xs">
          {groups.length === 0 && <p className="text-gray-500">No prompt matches.</p>}
          {groups.map((g) => (
            <section key={g} className="mb-3">
              <button aria-label={`Group: ${g}`} aria-expanded={!closed.has(g)} onClick={() => toggle(g)} className="mb-1 font-bold uppercase tracking-wider text-amber-700">
                {closed.has(g) ? '▸' : '▾'} {g}
              </button>
              {!closed.has(g) && shown.filter((i) => i.entry.group === g).map(({ entry, system, user }) => (
                <article key={entry.id} data-testid="prompt-entry" className="mb-2 rounded border border-gray-200 p-2">
                  <div className="flex items-start gap-2">
                    <h3 className="flex-1 text-sm font-semibold">{entry.title}</h3>
                    <button aria-label="Copy prompt" className="underline" onClick={() => clip(`SYSTEM\n${system}\n\nUSER\n${user}\n\nANSWER\n${entry.answer}`)}>Copy</button>
                  </div>
                  <p className="text-gray-600">{entry.situation}</p>
                  <p className="mt-1 font-semibold">System prompt</p>
                  <pre className="whitespace-pre-wrap rounded bg-gray-100 p-1">{system || '(none)'}</pre>
                  <p className="mt-1 font-semibold">User message (sample inputs)</p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-gray-100 p-1">{user}</pre>
                  <p className="mt-1 font-semibold">Expected answer</p>
                  <pre className="whitespace-pre-wrap rounded bg-gray-100 p-1">{entry.answer}</pre>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

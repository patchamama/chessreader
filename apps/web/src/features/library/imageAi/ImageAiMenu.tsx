import { useMemo, useRef, useState } from 'react'
import { parseFollowingMoves, type DiagramSolution, type SquareReading } from '@chess-ebook/chess-shared'
import { useLlm } from '../../../shared/llm'
import { nextPaint, withProgress } from '../../../shared/layout/busyStore'
import type { SaveSuggestionResult } from '../../suggestions/suggestionsApi'
import { generatedDiagramSvg } from '../utils/boardSvg'
import { registeredDiagrams, type DiagramEntry } from './diagramRegistry'
import { findPosition, visionReading } from './findPosition'
import { imageDataUrl } from './imageData'
import { aiTextToHtml, describePrompt, redrawPrompt } from './prompts'
import { DiagramReader, type ReaderResult } from './DiagramReader'
import { useSessionFenStore } from './sessionFens'
import { saveImageSuggestion, savedMessage } from './suggest'
import { templateReadings } from './templates'

interface Props {
  src: string
  alt: string
  /** The text printed after the image (its following moves). */
  followingText: string
  /** The position shown now (the "before" of a diagram-fen suggestion). */
  fen?: string
  /** A FEN accepted for this image. */
  onFen?: (fen: string) => void
  /** The book (or the reader) gives this diagram's FEN: nothing to find. */
  fenKnown?: boolean
}

type HtmlAction = 'describe' | 'redraw'
type Panel =
  | { kind: 'html'; action: HtmlAction; status: 'loading' | 'done' | 'error'; html?: string; model?: string; error?: string }
  | { kind: 'fen'; status: 'loading' | 'done' | 'error'; solutions?: DiagramSolution[]; pick?: number; sources?: string[]; author?: 'ai' | 'user'; model?: string; error?: string }
  | { kind: 'learn' }
  | { kind: 'batch'; status: 'loading' | 'done'; rows: BatchRow[] }

interface BatchRow {
  entry: DiagramEntry
  solution: DiagramSolution | null
  author: 'ai' | 'user'
  model?: string
  error?: string
  accepted?: boolean
}

const NO_MODEL_HINT = 'Set up an AI model in Settings to use the model actions.'
const ACTION_LABEL: Record<HtmlAction, string> = { describe: 'Describe / extract', redraw: 'Redraw clearly' }

/** The readings of a diagram from every reader there is: the book's templates, then the vision model. */
async function readDiagram(src: string, vision: ((image: string) => Promise<{ readings: SquareReading[]; model: string }>) | null) {
  const readings: SquareReading[][] = []
  const sources: string[] = []
  const templates = await templateReadings(src)
  if (templates.readings.length) { readings.push(templates.readings); sources.push(`templates (${templates.samples} diagrams)`) }
  let model: string | undefined
  if (vision) {
    const read = await vision(await imageDataUrl(src))
    readings.push(read.readings)
    sources.push('vision')
    model = read.model
  }
  sources.push('following moves')
  return { readings, sources, model }
}

/**
 * The AI icon of a book image (S4, S7): describe or extract it, redraw it
 * clearly, or find the position of a chess diagram (templates + vision +
 * the following moves through the solver), one by one or for the chapter.
 * Every result is previewed beside the original and only an Accept turns it
 * into a suggestion. Without a model, the learning reader (squares compared with
 * the book's bank, asking the user about doubts) and the solver from the moves are offered.
 */
export function ImageAiMenu({ src, alt, followingText, fen, onFen, fenKnown = false }: Props) {
  const llm = useLlm()
  const setSessionFen = useSessionFenStore((s) => s.setFen)
  const rootRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [message, setMessage] = useState<{ text: string; json?: string; path?: string } | null>(null)
  const hasMoves = useMemo(() => !!parseFollowingMoves(followingText), [followingText])
  const vision = llm.available && llm.vision

  // A diagram without a known FEN always has the reader (it needs no model); a known one only the model/moves actions.
  if (fenKnown && !llm.available && !hasMoves) return null

  const report = (r: SaveSuggestionResult) =>
    setMessage(r.saved ? { text: savedMessage(r) } : { text: savedMessage(r), json: r.json, path: r.path })
  const choose = (run: () => void) => () => { setOpen(false); setMessage(null); run() }
  const visionOf = (image: string) => visionReading(llm.complete, image)

  const runHtml = async (action: HtmlAction) => {
    setPanel({ kind: 'html', action, status: 'loading' })
    try {
      const image = await imageDataUrl(src)
      const result = await llm.complete(action === 'describe' ? describePrompt(image) : redrawPrompt(image))
      const html = aiTextToHtml(result.text)
      if (!html) throw new Error('The model gave no content')
      setPanel({ kind: 'html', action, status: 'done', html, model: result.model })
    } catch (e) {
      setPanel({ kind: 'html', action, status: 'error', error: (e as Error).message })
    }
  }

  const runFen = async (withVision: boolean) => {
    setPanel({ kind: 'fen', status: 'loading' })
    try {
      const out = await withProgress('Finding the position', async () => {
        const read = await readDiagram(src, withVision ? visionOf : null)
        await nextPaint()
        return { ...read, solutions: findPosition({ followingText, readings: read.readings }) }
      })
      if (!out.solutions.length) throw new Error('No legal position was found')
      setPanel({ kind: 'fen', status: 'done', solutions: out.solutions, pick: 0, sources: out.sources, author: out.model ? 'ai' : 'user', model: out.model })
    } catch (e) {
      setPanel({ kind: 'fen', status: 'error', error: (e as Error).message })
    }
  }

  const runBatch = async () => {
    const entries = registeredDiagrams().filter((d) => !d.printedFen)
    setPanel({ kind: 'batch', status: 'loading', rows: [] })
    const rows: BatchRow[] = []
    await withProgress('Finding the positions of the chapter\'s diagrams', async (progress) => {
      for (const [i, entry] of entries.entries()) {
        progress(i, entries.length)
        await nextPaint()
        try {
          const read = await readDiagram(entry.src, vision ? visionOf : null)
          const [best] = findPosition({ followingText: entry.followingText, readings: read.readings })
          rows.push({ entry, solution: best ?? null, author: read.model ? 'ai' : 'user', model: read.model })
        } catch (e) {
          rows.push({ entry, solution: null, author: 'user', error: (e as Error).message })
        }
        setPanel({ kind: 'batch', status: 'loading', rows: [...rows] })
      }
    })
    setPanel({ kind: 'batch', status: 'done', rows })
  }

  const acceptHtml = async (p: Extract<Panel, { kind: 'html' }>) => {
    if (!p.html) return
    const r = await saveImageSuggestion({
      kind: 'insert', src, element: rootRef.current, before: null,
      after: { html: p.html, action: p.action }, author: 'ai', model: p.model,
    })
    setPanel(null)
    report(r)
  }

  const acceptRead = async (r: ReaderResult) => {
    const note = r.approximate ? 'approximate: some answers (side to move, castling or en passant) were not known' : undefined
    setSessionFen(src, r.fen)
    onFen?.(r.fen)
    const res = await saveImageSuggestion({ kind: 'diagram-fen', src, element: rootRef.current, before: fen ? { fen } : null, after: { fen: r.fen, ...(note ? { note } : {}) }, author: r.author, model: r.model })
    setPanel(null)
    report(res)
  }

  const acceptFen = async (imageSrc: string, element: Element | null, newFen: string, author: 'ai' | 'user', model?: string, before?: string) => {
    setSessionFen(imageSrc, newFen)
    if (imageSrc === src) onFen?.(newFen)
    return saveImageSuggestion({ kind: 'diagram-fen', src: imageSrc, element, before: before ? { fen: before } : null, after: { fen: newFen }, author, model })
  }

  const acceptRow = async (row: BatchRow) => {
    if (!row.solution || row.accepted) return null
    row.accepted = true
    const el = row.entry.element ?? (row.entry.src === src ? rootRef.current : null)
    return acceptFen(row.entry.src, el, row.solution.fen, row.author, row.model)
  }

  return (
    <span data-image-ai="" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="AI actions for this image"
        aria-haspopup="menu"
        aria-expanded={open}
        title="AI actions for this image"
        className="absolute bottom-full right-10 z-10 mb-0.5 flex h-4 w-4 items-center justify-center rounded text-violet-400 transition hover:text-violet-700"
      >
        <SparkleIcon />
      </button>

      {open && (
        <span role="menu" aria-label="AI actions" className="absolute right-0 top-0 z-30 flex flex-col rounded-md border border-slate-200 bg-white py-1 text-[11px] shadow-lg">
          {!fenKnown && <MenuItem onClick={choose(() => setPanel({ kind: 'learn' }))}>Read this diagram (learn from the book)</MenuItem>}
          {vision && (
            <>
              <MenuItem onClick={choose(() => void runHtml('describe'))}>{ACTION_LABEL.describe}</MenuItem>
              <MenuItem onClick={choose(() => void runHtml('redraw'))}>{ACTION_LABEL.redraw}</MenuItem>
              <MenuItem onClick={choose(() => void runFen(true))}>Find the position</MenuItem>
            </>
          )}
          {!llm.available && (
            <>
              <MenuItem disabled hint={NO_MODEL_HINT}>{ACTION_LABEL.describe}</MenuItem>
              <MenuItem disabled hint={NO_MODEL_HINT}>{ACTION_LABEL.redraw}</MenuItem>
              <MenuItem disabled hint={NO_MODEL_HINT}>Find the position</MenuItem>
              <span className="px-3 py-0.5 text-[10px] text-slate-400">{NO_MODEL_HINT}</span>
            </>
          )}
          <MenuItem onClick={choose(() => void runFen(false))}>Find the position from the moves</MenuItem>
          <MenuItem onClick={choose(() => void runBatch())}>Find positions of all diagrams in this chapter</MenuItem>
        </span>
      )}

      {panel && (
        <span className="absolute left-0 top-full z-30 mt-1 block w-[min(36rem,90vw)] rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-700 shadow-lg">
          {panel.kind === 'html' && (
            <HtmlPanel panel={panel} src={src} alt={alt} onAccept={() => void acceptHtml(panel)} onReject={() => setPanel(null)} />
          )}
          {panel.kind === 'learn' && (
            <DiagramReader
              src={src}
              followingText={followingText}
              vision={vision ? async () => { const v = await visionOf(await imageDataUrl(src)); return { readings: v.readings, model: v.model } } : null}
              onAccept={(r) => void acceptRead(r)}
              onClose={() => setPanel(null)}
            />
          )}
          {panel.kind === 'fen' && (
            <FenPanel
              panel={panel}
              src={src}
              alt={alt}
              onPick={(pick) => setPanel({ ...panel, pick })}
              onAccept={async () => {
                const s = panel.solutions?.[panel.pick ?? 0]
                if (!s) return
                const r = await acceptFen(src, rootRef.current, s.fen, panel.author ?? 'user', panel.model, fen)
                setPanel(null)
                report(r)
              }}
              onReject={() => setPanel(null)}
            />
          )}
          {panel.kind === 'batch' && (
            <BatchPanel
              panel={panel}
              onAccept={async (row) => { const r = await acceptRow(row); if (r) report(r); setPanel({ ...panel }) }}
              onAcceptAll={async () => {
                let last: SaveSuggestionResult | null = null
                for (const row of panel.rows) last = (await acceptRow(row)) ?? last
                setPanel({ ...panel })
                if (last) report(last)
              }}
              onClose={() => setPanel(null)}
            />
          )}
        </span>
      )}

      {message && (
        <span role="status" className="mt-1 block text-[10px] text-slate-500">
          {message.text}
          {message.json && (
            <a
              className="ml-1 text-blue-700 underline"
              download={message.path?.split('/').pop() ?? 'suggestion.json'}
              href={`data:application/json;charset=utf-8,${encodeURIComponent(message.json)}`}
            >
              Download JSON
            </a>
          )}
        </span>
      )}
    </span>
  )
}

function MenuItem({ onClick, children, disabled, hint }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean; hint?: string }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} title={hint} className="whitespace-nowrap px-3 py-1 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent">
      {children}
    </button>
  )
}

function Buttons({ onAccept, onReject, disabled }: { onAccept: () => void; onReject: () => void; disabled?: boolean }) {
  return (
    <span className="mt-2 flex justify-end gap-2">
      <button type="button" onClick={onReject} className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50">Reject</button>
      <button type="button" onClick={onAccept} disabled={disabled} className="rounded border border-emerald-500 px-2 py-0.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">Accept</button>
    </span>
  )
}

function Original({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt="Original image" title={alt} className="block max-h-64 max-w-full object-contain" />
}

function HtmlPanel({ panel, src, alt, onAccept, onReject }: {
  panel: Extract<Panel, { kind: 'html' }>; src: string; alt: string; onAccept: () => void; onReject: () => void
}) {
  return (
    <>
      <span className="mb-1 block font-semibold">{ACTION_LABEL[panel.action]}</span>
      {panel.status === 'loading' && <span role="status" className="block text-slate-400">Asking the model…</span>}
      {panel.status === 'error' && <span role="alert" className="block text-red-600">{panel.error}</span>}
      {panel.status === 'done' && (
        <span className="grid grid-cols-2 gap-2">
          <Original src={src} alt={alt} />
          {/* Cleaned by cleanAiHtml (suggestions sanitiser + whitelist): no scripts, SVG, images or attributes. */}
          <div data-testid="ai-preview" className="ai-preview max-h-64 overflow-auto border-l border-slate-200 pl-2 [&_td]:border [&_td]:px-1 [&_th]:border [&_th]:px-1" dangerouslySetInnerHTML={{ __html: panel.html ?? '' }} />
        </span>
      )}
      <Buttons onAccept={onAccept} onReject={onReject} disabled={panel.status !== 'done'} />
    </>
  )
}

function FenPanel({ panel, src, alt, onPick, onAccept, onReject }: {
  panel: Extract<Panel, { kind: 'fen' }>; src: string; alt: string; onPick: (i: number) => void; onAccept: () => void; onReject: () => void
}) {
  const s = panel.solutions?.[panel.pick ?? 0]
  return (
    <>
      <span className="mb-1 block font-semibold">Find the position</span>
      {panel.status === 'loading' && <span role="status" className="block text-slate-400">Reading the diagram…</span>}
      {panel.status === 'error' && <span role="alert" className="block text-red-600">{panel.error}</span>}
      {s && (
        <>
          <span className="grid grid-cols-2 items-start gap-2">
            <Original src={src} alt={alt} />
            <span role="img" aria-label="Found position" className="block" dangerouslySetInnerHTML={{ __html: generatedDiagramSvg(s.fen, 200) }} />
          </span>
          <span className="mt-1 block">{`${s.playedMoves}/${s.totalMoves} following moves play`}</span>
          <span className="block text-slate-500">
            {s.changedSquares.length
              ? `Changed squares: ${s.changedSquares.map((c) => `${c.square} ${c.reading ?? '·'}→${c.piece ?? '·'}`).join(', ')}`
              : 'No squares changed from the reading.'}
          </span>
          <span className="block font-mono text-[10px] text-slate-500">{s.fen}</span>
          {panel.sources && <span className="block text-[10px] text-slate-400">From: {panel.sources.join(', ')}</span>}
          {(panel.solutions?.length ?? 0) > 1 && (
            <span className="mt-1 flex gap-1">
              {panel.solutions!.map((x, i) => (
                <button key={x.fen} type="button" aria-pressed={i === (panel.pick ?? 0)} onClick={() => onPick(i)} className="rounded border border-slate-300 px-1.5 aria-pressed:bg-slate-100">
                  {`Candidate ${i + 1} (${x.playedMoves}/${x.totalMoves})`}
                </button>
              ))}
            </span>
          )}
        </>
      )}
      <Buttons onAccept={onAccept} onReject={onReject} disabled={!s} />
    </>
  )
}

function BatchPanel({ panel, onAccept, onAcceptAll, onClose }: {
  panel: Extract<Panel, { kind: 'batch' }>; onAccept: (row: BatchRow) => void; onAcceptAll: () => void; onClose: () => void
}) {
  return (
    <>
      <span className="mb-1 block font-semibold">Positions of the chapter&apos;s diagrams</span>
      {panel.status === 'loading' && <span role="status" className="block text-slate-400">{`Solving… ${panel.rows.length} done`}</span>}
      <span className="block max-h-96 overflow-auto">
        {panel.rows.map((row) => (
          <span key={row.entry.id} data-testid="batch-row" className="flex items-center gap-2 border-b border-slate-100 py-1">
            <img src={row.entry.src} alt="Original image" className="h-16 w-16 object-contain" />
            {row.solution
              ? <span role="img" aria-label="Found position" className="block h-16 w-16" dangerouslySetInnerHTML={{ __html: generatedDiagramSvg(row.solution.fen, 64) }} />
              : <span className="block h-16 w-16 text-red-600">{row.error ?? 'No position'}</span>}
            <span className="flex-1">{row.solution ? `${row.solution.playedMoves}/${row.solution.totalMoves} following moves play` : ''}</span>
            <button type="button" disabled={!row.solution || row.accepted} onClick={() => onAccept(row)} className="rounded border border-emerald-500 px-2 py-0.5 text-emerald-700 disabled:opacity-40">
              {row.accepted ? 'Accepted' : 'Accept'}
            </button>
          </span>
        ))}
      </span>
      <span className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded border border-slate-300 px-2 py-0.5">Close</button>
        <button type="button" onClick={onAcceptAll} disabled={panel.status !== 'done'} className="rounded border border-emerald-500 px-2 py-0.5 text-emerald-700 disabled:opacity-40">Accept all</button>
      </span>
    </>
  )
}

function SparkleIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6z" />
      <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z" />
    </svg>
  )
}

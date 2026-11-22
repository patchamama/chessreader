import { useEffect, useMemo, useRef, useState } from 'react'
import type { SquareReading } from '@chess-ebook/chess-shared'
import { parseFollowingMoves } from '@chess-ebook/chess-shared'
import { bookKeyOf } from './diagramRegistry'
import { boardOf, readWithBank, withVision, type SquareRead } from './bankReader'
import { assembleFen, castlingOptions, enPassantOptions, sideFromFollowing, validatePlacement } from './positionValidation'
import { encodePatch, exportBank, importBank, useSquareBank } from './squareBank'
import { learnFromKnownDiagrams, loadBoard, type BoardBox } from './templates'
import { PATCH } from './templateReader'

export interface ReaderResult {
  fen: string
  author: 'ai' | 'user'
  model?: string
  /** Some answer was "I do not know" (or defaulted): the suggestion says so. */
  approximate: boolean
}

interface Props {
  src: string
  followingText: string
  /** The vision model's reading as one more vote (null: no vision model). */
  vision: (() => Promise<{ readings: SquareReading[]; model: string }>) | null
  onAccept: (result: ReaderResult) => void
  onClose: () => void
}

const PIECE_NAMES: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' }
const GLYPH: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const ALL_LABELS = ['.', ...'KQRBNPkqrbnp'.split('')]
const CASTLING_NAME: Record<string, string> = { K: 'White kingside (K)', Q: 'White queenside (Q)', k: 'Black kingside (k)', q: 'Black queenside (q)' }

const labelName = (l: string) => (l === '.' ? 'Empty' : `${l === l.toUpperCase() ? 'White' : 'Black'} ${PIECE_NAMES[l.toUpperCase()]}`)

/**
 * Reads a diagram square by square against the book's learning bank. Doubtful
 * squares are asked one by one (each answer teaches the bank and the diagram is
 * read again), then the user reviews the board, any square can be corrected,
 * the position is validated and the questions the FEN needs are asked.
 */
export function DiagramReader({ src, followingText, vision, onAccept, onClose }: Props) {
  const book = bookKeyOf(src)
  const bank = useSquareBank((s) => s.banks[book])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [patches, setPatches] = useState<Float32Array[]>([])
  const [box, setBox] = useState<BoardBox | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [skipped, setSkipped] = useState<string[]>([])
  const [handled, setHandled] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [visionVote, setVisionVote] = useState<{ readings: SquareReading[]; model: string } | null>(null)
  const textSide = useMemo(() => sideFromFollowing(followingText), [followingText])
  const moveNumber = useMemo(() => parseFollowingMoves(followingText)?.moveNumber ?? 1, [followingText])
  const [side, setSide] = useState<'w' | 'b' | 'unknown'>(textSide ?? 'w')
  const [sideTouched, setSideTouched] = useState(false)
  const [castling, setCastling] = useState<string[]>([])
  const [castlingUnknown, setCastlingUnknown] = useState(false)
  const [enPassant, setEnPassant] = useState('none')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    useSquareBank.getState().get(book)
    ;(async () => {
      try {
        const loaded = await loadBoard(src)
        await learnFromKnownDiagrams(src)
        if (!live) return
        setPatches(loaded.patches)
        setBox(loaded.box)
        setStatus('ready')
        if (vision) {
          try { const v = await vision(); if (live) setVisionVote(v) } catch { /* the vision reading is an optional extra */ }
        }
      } catch (e) {
        if (live) { setError((e as Error).message); setStatus('error') }
      }
    })()
    return () => { live = false }
  }, [src, book, vision])

  const reads: SquareRead[] = useMemo(() => {
    if (!patches.length) return []
    const base = readWithBank(patches, bank ?? [])
    const voted = visionVote ? withVision(base, visionVote.readings, new Set(Object.keys(answers))) : base
    return voted.map((r) => (answers[r.square] != null ? { ...r, label: answers[r.square], doubt: false } : r))
  }, [patches, bank, visionVote, answers])

  const doubts = reads.filter((r) => r.doubt && !skipped.includes(r.square))
  const placement = boardOf(reads)
  const answer = (r: SquareRead, label: string, counted: boolean) => {
    const colour = (Math.floor(r.index / 8) + (r.index % 8)) % 2 as 0 | 1
    useSquareBank.getState().add(book, [{ label, colour, patch: encodePatch(patches[r.index]) }])
    setAnswers((a) => ({ ...a, [r.square]: label }))
    setSkipped((s) => s.filter((x) => x !== r.square))
    setEditing(null)
    if (counted) setHandled((n) => n + 1)
  }

  const sideForChecks = side === 'unknown' ? undefined : side
  const issues = useMemo(() => (reads.length ? validatePlacement(placement, sideForChecks) : []), [reads.length, placement, sideForChecks])
  const castlingChoices = useMemo(() => castlingOptions(placement), [placement])
  const epChoices = useMemo(() => (side === 'unknown' ? [] : enPassantOptions(placement, side)), [placement, side])
  const activeCastling = castlingUnknown ? [] : castling.filter((c) => castlingChoices.includes(c))
  const ep = epChoices.includes(enPassant) ? enPassant : null

  if (status === 'loading') return <span role="status" className="block text-slate-400">Reading the diagram…</span>
  if (status === 'error') {
    return (
      <>
        <span role="alert" className="block text-red-600">{error}</span>
        <button type="button" onClick={onClose} className="mt-2 rounded border border-slate-300 px-2 py-0.5">Close</button>
      </>
    )
  }

  const current = doubts[0]
  const accept = () => {
    const approximate = side === 'unknown' || castlingUnknown || enPassant === 'unknown' || (side === 'w' && !textSide && !sideTouched)
    onAccept({
      fen: assembleFen({ placement, side: side === 'unknown' ? 'w' : side, castling: activeCastling, enPassant: ep, moveNumber }),
      author: visionVote ? 'ai' : 'user', model: visionVote?.model, approximate,
    })
  }
  const importFile = async (file: File | undefined) => {
    if (!file) return
    try { useSquareBank.getState().merge(book, importBank(await file.text())) } catch (e) { setError((e as Error).message); setStatus('error') }
  }

  return (
    <>
      <span className="mb-1 block font-semibold">Read this diagram</span>

      {current && box && (
        <DoubtDialog
          read={current} box={box} src={src} patch={patches[current.index]}
          position={`Doubt ${handled + skipped.length + 1} of ${handled + skipped.length + doubts.length}`}
          onAnswer={(l) => answer(current, l, true)}
          onSkip={() => setSkipped((s) => [...s, current.square])}
        />
      )}

      <span role="region" aria-label="Position read" className="block">
        <span className="grid w-[16rem] grid-cols-8">
          {reads.map((r) => (
            <button
              key={r.square} type="button"
              aria-label={`${r.square}: ${labelName(r.label)}`}
              onClick={() => setEditing(r.square)}
              className={`flex h-8 w-8 items-center justify-center text-lg leading-none ${((Math.floor(r.index / 8) + (r.index % 8)) % 2) ? 'bg-slate-300' : 'bg-slate-100'} ${r.doubt ? 'ring-2 ring-inset ring-amber-400' : ''} ${editing === r.square ? 'outline outline-2 outline-blue-500' : ''}`}
            >
              {GLYPH[r.label] ?? ''}
            </button>
          ))}
        </span>
        {skipped.length > 0 && <span className="block text-[10px] text-amber-700">{`Skipped squares (outlined): ${skipped.join(', ')}. Click any square to correct it.`}</span>}
        {editing && (
          <span className="mt-1 flex flex-wrap gap-1">
            {ALL_LABELS.map((l) => (
              <button key={l} type="button" aria-label={`Set ${editing} to ${labelName(l)}`} title={labelName(l)} onClick={() => answer(reads.find((r) => r.square === editing)!, l, false)} className="h-6 min-w-6 rounded border border-slate-300 px-1 hover:bg-slate-50">
                {GLYPH[l] ?? '·'}
              </button>
            ))}
          </span>
        )}

        {issues.length > 0 && (
          <ul role="alert" className="mt-1 list-disc pl-4 text-red-600">
            {issues.map((i) => <li key={i}>{i}</li>)}
          </ul>
        )}

        <span className="mt-2 grid gap-1">
          <label className="flex items-center gap-2">
            Side to move
            <select aria-label="Side to move" value={side} onChange={(e) => { setSide(e.target.value as 'w' | 'b' | 'unknown'); setSideTouched(true) }} className="rounded border border-slate-300">
              <option value="w">White</option>
              <option value="b">Black</option>
              <option value="unknown">I do not know</option>
            </select>
            {!textSide && !sideTouched && <span className="text-[10px] text-slate-400">No moves after the diagram: please choose.</span>}
          </label>
          {castlingChoices.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              Castling still possible:
              {castlingChoices.map((c) => (
                <label key={c} className="flex items-center gap-1">
                  <input type="checkbox" checked={activeCastling.includes(c)} disabled={castlingUnknown} onChange={(e) => setCastling((cur) => (e.target.checked ? [...cur, c] : cur.filter((x) => x !== c)))} />
                  {CASTLING_NAME[c]}
                </label>
              ))}
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={castlingUnknown} onChange={(e) => setCastlingUnknown(e.target.checked)} />
                I do not know
              </label>
            </span>
          )}
          {epChoices.length > 0 && (
            <label className="flex items-center gap-2">
              En passant
              <select aria-label="En passant" value={enPassant} onChange={(e) => setEnPassant(e.target.value)} className="rounded border border-slate-300">
                <option value="none">None</option>
                {epChoices.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="unknown">I do not know</option>
              </select>
            </label>
          )}
        </span>

        <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span>{`${bank?.length ?? 0} squares learned for this book`}</span>
          <a className="text-blue-700 underline" download={`square-bank-${book}.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(exportBank(bank ?? []))}`}>Export bank</a>
          <button type="button" className="text-blue-700 underline" onClick={() => importRef.current?.click()}>Import bank</button>
          <input ref={importRef} type="file" accept="application/json" aria-label="Import bank file" className="hidden" onChange={(e) => void importFile(e.target.files?.[0])} />
        </span>

      <span className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50">Reject</button>
          <button type="button" onClick={accept} disabled={issues.length > 0 || !!current} className="rounded border border-emerald-500 px-2 py-0.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">Accept</button>
        </span>
      </span>
    </>
  )
}

function DoubtDialog({ read, box, src, patch, position, onAnswer, onSkip }: {
  read: SquareRead; box: BoardBox; src: string; patch: Float32Array; position: string; onAnswer: (label: string) => void; onSkip: () => void
}) {
  const f = read.index % 8, r = Math.floor(read.index / 8)
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`
  return (
    <span role="dialog" aria-modal="true" aria-label="Which piece is this?" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <span className="block w-[min(26rem,92vw)] rounded-md bg-white p-3 text-[12px] shadow-xl">
        <span className="mb-1 flex items-center justify-between">
          <strong>Which piece is this?</strong>
          <span className="text-slate-500">{position}</span>
        </span>
        <span className="flex items-start gap-3">
          <svg role="img" aria-label="The square, enlarged" viewBox={`0 0 ${PATCH} ${PATCH}`} shapeRendering="crispEdges" className="h-20 w-20 border border-slate-300">
            {Array.from(patch ?? [], (v, i) => <rect key={i} x={i % PATCH} y={Math.floor(i / PATCH)} width="1" height="1" fill={`rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)})`} />)}
          </svg>
          <span className="relative inline-block">
            <img src={src} alt="The diagram" className="block max-h-24 max-w-[10rem] object-contain" />
            <span aria-hidden="true" className="absolute border-2 border-red-500" style={{ left: pct(box.x + ((box.w * f) / 8)), top: pct(box.y + ((box.h * r) / 8)), width: pct(box.w / 8), height: pct(box.h / 8) }} />
          </span>
          <span>Square <strong>{read.square}</strong></span>
        </span>
        {read.candidates.length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1">
            {read.candidates.map((l) => (
              <button key={l} type="button" aria-label={`Likely: ${labelName(l)}`} onClick={() => onAnswer(l)} className="rounded border border-emerald-500 px-2 py-0.5 text-emerald-700 hover:bg-emerald-50">{`${GLYPH[l] ?? '·'} ${labelName(l)}`}</button>
            ))}
          </span>
        )}
        <span className="mt-2 flex flex-wrap gap-1">
          {ALL_LABELS.map((l) => (
            <button key={l} type="button" aria-label={labelName(l)} title={labelName(l)} onClick={() => onAnswer(l)} className="h-7 min-w-7 rounded border border-slate-300 px-1 hover:bg-slate-50">{GLYPH[l] ?? '·'}</button>
          ))}
        </span>
        <span className="mt-2 flex justify-end">
          <button type="button" onClick={onSkip} className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-50">Skip</button>
        </span>
      </span>
    </span>
  )
}

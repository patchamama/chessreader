import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { SaveSuggestionResult } from '../../suggestions/suggestionsApi'
import type { MoveBefore } from '../utils/inferDiagramFen'
import { anchorOf, editBlocks, movesAfterBlock, type EditBlock } from './editBlocks'
import { describeSave } from './editSave'
import { InsertPanel } from './InsertPanel'
import { ParagraphEditPanel } from './ParagraphEditPanel'

interface Box { top: number; bottom: number }

type Open =
  | { type: 'insert'; block: EditBlock; position: { main: MoveBefore | null; variation: MoveBefore | null } }
  | { type: 'edit'; block: EditBlock }

export interface EditLayerProps {
  /** The element holding the chapter's HTML. */
  containerRef: RefObject<HTMLElement | null>
  /** The chapter as loaded (what anchors count). */
  rawHtml: string
  /** Changes whenever the shown chapter does (the blocks are found again). */
  shownHtml: string
  book: string | null
  chapter: number
  isMainline: (gameIndex: number, nodeId: string) => boolean
}

/**
 * Edit mode over the reading pane (S8): a ＋ under every block of the chapter
 * to insert content after it, and a ✎ beside each paragraph (shown on hover or
 * focus) to correct its text. The handles live in a layer over the text, so the
 * chapter's own DOM (read for moves) is never changed.
 */
export function EditLayer({ containerRef, rawHtml, shownHtml, book, chapter, isMainline }: EditLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [blocks, setBlocks] = useState<EditBlock[]>([])
  const [boxes, setBoxes] = useState<Box[]>([])
  const [hovered, setHovered] = useState<number | null>(null)
  const [open, setOpen] = useState<Open | null>(null)
  const [status, setStatus] = useState<{ text: string; json?: string; path?: string } | null>(null)

  const measure = useCallback(() => {
    const container = containerRef.current
    const layer = layerRef.current
    if (!container || !layer) return
    const found = editBlocks(container, rawHtml)
    const origin = layer.getBoundingClientRect().top
    setBlocks(found)
    setBoxes(found.map((b) => {
      const r = b.el.getBoundingClientRect()
      return { top: r.top - origin, bottom: r.bottom - origin }
    }))
  }, [containerRef, rawHtml])

  useLayoutEffect(() => { measure() }, [measure, shownHtml])

  // The page adds move links and diagram boards after the chapter is shown, and the width can change: measure again.
  useEffect(() => {
    const container = containerRef.current
    const frame = requestAnimationFrame(measure)
    const late = window.setTimeout(measure, 500)
    const observer = typeof ResizeObserver !== 'undefined' && container ? new ResizeObserver(() => measure()) : null
    if (observer && container) observer.observe(container)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(late)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [containerRef, measure, shownHtml])

  // The paragraph under the pointer shows its ✎.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null
      const at = target ? blocks.findIndex((b) => b.el.contains(target)) : -1
      setHovered(at >= 0 ? at : null)
    }
    container.addEventListener('mouseover', onOver)
    return () => container.removeEventListener('mouseover', onOver)
  }, [containerRef, blocks])

  const openInsert = (block: EditBlock) => {
    const container = containerRef.current
    const position = container && block.el.isConnected ? movesAfterBlock(block.el, container, isMainline) : { main: null, variation: null }
    setStatus(null)
    setOpen({ type: 'insert', block, position })
  }

  const onSaved = (r: SaveSuggestionResult) => {
    setOpen(null)
    setStatus(r.saved ? { text: describeSave(r) } : { text: describeSave(r), json: r.json, path: r.path })
  }
  const close = useCallback(() => setOpen(null), [])

  return (
    <>
      <div ref={layerRef} data-testid="edit-layer" className="pointer-events-none absolute inset-0">
        {blocks.map((b, i) => {
          const box = boxes[i] ?? { top: 0, bottom: 0 }
          return (
            <div key={`${b.index}-${i}`}>
              <button
                type="button"
                aria-label={`Insert after block ${b.index + 1}`}
                title="Insert text, a diagram, HTML or an image here"
                onClick={() => openInsert(b)}
                style={{ top: box.bottom - 10 }}
                className="pointer-events-auto absolute left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-blue-300 bg-white text-xs font-bold text-blue-600 opacity-60 shadow-sm transition hover:opacity-100 focus:opacity-100"
              >
                ＋
              </button>
              {b.textual && (
                <button
                  type="button"
                  aria-label={`Edit paragraph ${b.index + 1}`}
                  title="Suggest a corrected text for this paragraph"
                  onClick={() => { setStatus(null); setOpen({ type: 'edit', block: b }) }}
                  style={{ top: box.top }}
                  className={`pointer-events-auto absolute -right-7 z-10 flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-xs text-slate-600 shadow-sm transition hover:opacity-100 focus:opacity-100 ${hovered === i ? 'opacity-100' : 'opacity-0'}`}
                >
                  ✎
                </button>
              )}
            </div>
          )
        })}
      </div>

      {!book && (
        <p role="status" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded bg-amber-100 px-3 py-2 text-sm text-amber-900 shadow">
          The book's title is not known yet: suggestions cannot be saved.
        </p>
      )}
      {status && (
        <div role="status" className="fixed bottom-4 left-1/2 z-40 flex max-w-lg -translate-x-1/2 items-center gap-3 rounded bg-slate-800 px-3 py-2 text-sm text-white shadow">
          <span>{status.text}</span>
          {status.json && (
            <a
              href={`data:application/json;charset=utf-8,${encodeURIComponent(status.json)}`}
              download={status.path?.split('/').pop() ?? 'suggestion.json'}
              className="underline"
            >
              Download JSON
            </a>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => setStatus(null)} className="px-1">×</button>
        </div>
      )}

      {open?.type === 'insert' && book && (
        <InsertPanel book={book} chapter={chapter} anchor={anchorOf(chapter, open.block)} position={open.position} onClose={close} onSaved={onSaved} />
      )}
      {open?.type === 'edit' && book && (
        <ParagraphEditPanel book={book} chapter={chapter} anchor={anchorOf(chapter, open.block)} original={open.block.text} onClose={close} onSaved={onSaved} />
      )}
    </>
  )
}

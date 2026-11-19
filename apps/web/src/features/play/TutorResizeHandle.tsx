import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { TUTOR_HEIGHT, clampTutorHeight } from './playPrefs'

interface Props {
  height: number
  onChange: (height: number) => void
  label: string
}

/** A horizontal splitter under the tutor panel: drag it, or use the arrow keys, to change the panel's height (S13). */
export function TutorResizeHandle({ height, onChange, label }: Props) {
  const drag = useRef<{ y: number; h: number } | null>(null)
  const start = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    drag.current = { y: e.clientY, h: height }
    const move = (ev: globalThis.PointerEvent) => {
      if (drag.current) onChange(clampTutorHeight(drag.current.h + ev.clientY - drag.current.y))
    }
    const up = (ev: globalThis.PointerEvent) => {
      move(ev)
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = { ArrowDown: height + TUTOR_HEIGHT.step, ArrowUp: height - TUTOR_HEIGHT.step, Home: TUTOR_HEIGHT.min, End: TUTOR_HEIGHT.max }[e.key]
    if (next === undefined) return
    e.preventDefault()
    onChange(clampTutorHeight(next))
  }
  return (
    <div role="separator" aria-label={label} title={label} aria-orientation="horizontal" tabIndex={0}
      aria-valuenow={height} aria-valuemin={TUTOR_HEIGHT.min} aria-valuemax={TUTOR_HEIGHT.max}
      onPointerDown={start} onKeyDown={key}
      className="-mt-2 flex h-3 cursor-row-resize touch-none items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <span aria-hidden="true" className="h-1 w-12 rounded-full bg-slate-300" />
    </div>
  )
}

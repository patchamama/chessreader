import { useEffect, useRef } from 'react'
import { useStudyBoardStore } from '../store/studyBoardStore'

/**
 * Freehand drawing layer sitting on top of the board.
 *
 * - Captures pointer events only when the active tool is `pen` or `eraser`,
 *   otherwise it is transparent to clicks so the board/arrows keep working.
 * - Pen draws smoothed (quadratic) strokes; eraser uses `destination-out`
 *   for partial pixel erase.
 * - On stroke end the canvas is snapshotted to a data URL and stored per
 *   position; when the position changes the stored snapshot is restored.
 */
export function PenCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  const toolMode = useStudyBoardStore((s) => s.toolMode)
  const brushColor = useStudyBoardStore((s) => s.brushColor)
  const brushSize = useStudyBoardStore((s) => s.brushSize)
  const penData = useStudyBoardStore((s) => s.annotations.pen)
  const currentNodeId = useStudyBoardStore((s) => s.currentNodeId)
  const setPen = useStudyBoardStore((s) => s.setPen)

  const active = toolMode === 'pen' || toolMode === 'eraser'

  // Keep the canvas backing-store sized to its rendered box and (re)draw the
  // stored snapshot. Runs on mount, on position change, and on resize.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const redraw = () => {
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (penData) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        img.src = penData
      }
    }

    redraw()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(redraw)
    ro.observe(canvas)
    return () => ro.disconnect()
    // currentNodeId triggers restore on navigation; penData restore on external change
  }, [penData, currentNodeId])

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active) return
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!active || !drawing.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !last.current) return
    const p = pos(e)

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (toolMode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = brushSize * 4
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = brushColor
      ctx.lineWidth = brushSize
    }
    // Smoothed segment: quadratic curve through the midpoint.
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 }
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y)
    ctx.stroke()
    last.current = p
  }

  const finish = () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    const canvas = canvasRef.current
    if (canvas) setPen(canvas.toDataURL())
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerLeave={finish}
      className={`absolute inset-0 h-full w-full ${
        active ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
      }`}
    />
  )
}

import { useStudyBoardStore } from '../store/studyBoardStore'
import type { ToolMode } from '../store/studyBoardStore'

const HIGHLIGHT_COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#eab308', '#a855f7']
const BRUSH_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#000000']

interface ToolButtonProps {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}

function ToolButton({ active, onClick, title, children }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex h-8 w-8 items-center justify-center rounded-md border text-slate-600 transition ${
        active
          ? 'border-emerald-400 bg-emerald-50 text-emerald-600'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

export function AnnotationToolbar() {
  const toolMode = useStudyBoardStore((s) => s.toolMode)
  const setTool = useStudyBoardStore((s) => s.setTool)
  const highlightColor = useStudyBoardStore((s) => s.highlightColor)
  const setHighlightColor = useStudyBoardStore((s) => s.setHighlightColor)
  const brushColor = useStudyBoardStore((s) => s.brushColor)
  const brushSize = useStudyBoardStore((s) => s.brushSize)
  const setBrush = useStudyBoardStore((s) => s.setBrush)
  const clearAnnotations = useStudyBoardStore((s) => s.clearAnnotations)

  const is = (m: ToolMode) => toolMode === m

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <ToolButton active={is('arrows')} onClick={() => setTool('arrows')} title="Draw arrows">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H9M17 7v8" />
          </svg>
        </ToolButton>
        <ToolButton active={is('highlight')} onClick={() => setTool('highlight')} title="Highlight squares">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        </ToolButton>
        <ToolButton active={is('pen')} onClick={() => setTool('pen')} title="Pen — freehand draw">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 5.5l3 3L8 19l-4 1 1-4 10.5-10.5z" />
          </svg>
        </ToolButton>
        <ToolButton active={is('eraser')} onClick={() => setTool('eraser')} title="Eraser">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 4l4 4-9 9H6l-2-2 12-11z" />
          </svg>
        </ToolButton>
        <button
          onClick={clearAnnotations}
          title="Clear all annotations"
          className="ml-auto flex h-8 items-center rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
        >
          Clear
        </button>
      </div>

      {/* Highlight color picker */}
      {is('highlight') && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Color</span>
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setHighlightColor(c)}
              title={c}
              className={`h-5 w-5 rounded-full border-2 ${highlightColor === c ? 'border-slate-700' : 'border-white'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      {/* Pen brush controls */}
      {is('pen') && (
        <div className="flex items-center gap-1.5">
          {BRUSH_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setBrush(c, brushSize)}
              title={c}
              className={`h-5 w-5 rounded-full border-2 ${brushColor === c ? 'border-slate-700' : 'border-white'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="range"
            min={1}
            max={10}
            value={brushSize}
            onChange={(e) => setBrush(brushColor, Number(e.target.value))}
            className="ml-1 w-20"
            title="Brush size"
          />
        </div>
      )}
    </div>
  )
}

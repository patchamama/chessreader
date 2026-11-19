/** The "already opened" mark of a game or a book in a list. */
export function VisitedMark() {
  return (
    <span aria-label="Already opened" title="Already opened" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold leading-none text-white">
      ✓
    </span>
  )
}

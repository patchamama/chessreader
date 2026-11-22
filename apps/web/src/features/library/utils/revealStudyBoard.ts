/**
 * Bring the study board into view: the right-hand pane scrolls back to its top
 * (where the board is) and the page itself scrolls when the board is off screen.
 */
export function revealStudyBoard(): void {
  const pane = document.querySelector<HTMLElement>('[data-study-pane]')
  if (pane && pane.scrollTop !== 0) {
    if (typeof pane.scrollTo === 'function') pane.scrollTo({ top: 0, behavior: 'smooth' })
    pane.scrollTop = 0
  }
  const board = document.querySelector('[data-study-board]')
  if (board) {
    const r = board.getBoundingClientRect()
    if (r.top < 0 || r.bottom > window.innerHeight) board.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }
}

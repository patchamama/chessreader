/** A line that starts with a move number ("1. d4", "26... Ne4", "8 axb5"). */
const MOVE_LINE = /^\d{1,3}(?:\.{1,3}|…)?\s*\S/

/**
 * The generated commentary opens with a summary (opening, accuracy, key moves).
 * Placed right under the book's heading it would read as prose and hide that
 * heading from the reader: it goes after the first line of moves instead.
 */
export function introAfterFirstMove(body: string): string {
  const lines = body.split('\n')
  const first = lines.findIndex((l) => MOVE_LINE.test(l.trim()))
  if (first <= 0) return body
  return [lines[first], ...lines.slice(0, first), ...lines.slice(first + 1)].join('\n')
}

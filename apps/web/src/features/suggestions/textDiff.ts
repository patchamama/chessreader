/** One piece of a word diff: kept, removed (only before) or added (only after). */
export interface DiffPart {
  type: 'same' | 'removed' | 'added'
  text: string
}

const MAX_CELLS = 4_000_000

/**
 * Word-level diff of two texts (longest common subsequence over words and the
 * spaces between them). Very long texts fall back to "all removed, all added".
 */
export function textDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean)
  const b = after.split(/(\s+)/).filter(Boolean)
  if (a.length * b.length > MAX_CELLS) {
    return [...(before ? [{ type: 'removed' as const, text: before }] : []), ...(after ? [{ type: 'added' as const, text: after }] : [])]
  }
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const parts: DiffPart[] = []
  const push = (type: DiffPart['type'], text: string) => {
    const last = parts[parts.length - 1]
    if (last && last.type === type) last.text += text
    else parts.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('removed', a[i++])
    else push('added', b[j++])
  }
  while (i < a.length) push('removed', a[i++])
  while (j < b.length) push('added', b[j++])
  return parts
}

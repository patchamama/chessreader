/** The two squares of "a2-g8", "d4-d5", "Ac8-b7" (a line or a plan written in the text), or null. */
export function dashedPair(raw: string): { from: string; to: string } | null {
  const m = /^[KQRBNDTAC]?([a-h][1-8])[-–x:]([a-h][1-8])/.exec(raw.trim())
  return m ? { from: m[1], to: m[2] } : null
}

/** Every square from `a` to `b` when they share a file, a rank or a diagonal (both included), else null. */
export function squareLine(a: string, b: string): string[] | null {
  const f0 = a.charCodeAt(0) - 97, r0 = Number(a[1]) - 1
  const f1 = b.charCodeAt(0) - 97, r1 = Number(b[1]) - 1
  const df = Math.sign(f1 - f0), dr = Math.sign(r1 - r0)
  const n = Math.max(Math.abs(f1 - f0), Math.abs(r1 - r0))
  const straight = f0 === f1 || r0 === r1
  const diagonal = Math.abs(f1 - f0) === Math.abs(r1 - r0)
  if (n === 0 || (!straight && !diagonal)) return null
  return Array.from({ length: n + 1 }, (_, i) => `${String.fromCharCode(97 + f0 + df * i)}${r0 + dr * i + 1}`)
}

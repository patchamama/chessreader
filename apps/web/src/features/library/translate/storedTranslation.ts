/** SHA-1 of a string's UTF-8 bytes, in hex: the server names a book's game with it (PHP sha1). */
export function sha1Hex(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const words: number[] = []
  const length = bytes.length
  for (let i = 0; i < length; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8)
  words[length >> 2] |= 0x80 << (24 - (length % 4) * 8)
  const total = (((length + 8) >> 6) + 1) * 16
  for (let i = 0; i < total; i++) words[i] ||= 0
  words[total - 1] = length * 8
  const rol = (n: number, s: number) => (n << s) | (n >>> (32 - s))
  let h0 = 0x67452301, h1 = 0xefcdab89 | 0, h2 = 0x98badcfe | 0, h3 = 0x10325476, h4 = 0xc3d2e1f0 | 0
  const w = new Array<number>(80)
  for (let block = 0; block < total; block += 16) {
    for (let t = 0; t < 80; t++) w[t] = t < 16 ? words[block + t] | 0 : rol(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1)
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let t = 0; t < 80; t++) {
      const [f, k] = t < 20 ? [(b & c) | (~b & d), 0x5a827999] : t < 40 ? [b ^ c ^ d, 0x6ed9eba1] : t < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc | 0] : [b ^ c ^ d, 0xca62c1d6 | 0]
      const temp = (rol(a, 5) + f + e + k + w[t]) | 0
      e = d; d = c; c = rol(b, 30); b = a; a = temp
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0
  }
  return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('')
}

/** The id the server gives a book's game: "b" + the first 12 hex of sha1(title|chapter|pgn). */
export const bookGameId = (title: string, chapter: number, pgn: string): string => `b${sha1Hex(`${title}|${chapter}|${pgn}`).slice(0, 12)}`

/**
 * The stored PGN of a translated game back into the lines of the book's text: moves stay
 * a line, each {comment} is a line. `leading` counts the comment lines before the first move.
 */
export function pgnToTranslatedText(pgn: string): { text: string; leading: number } {
  const body = pgn.replace(/^(\[[^\]]*\]\s*)+/, '').trim()
  const lines: { comment: boolean; text: string }[] = []
  let rest = body
  for (;;) {
    const open = rest.indexOf('{')
    const close = open < 0 ? -1 : rest.indexOf('}', open)
    const moves = (open < 0 || close < 0 ? rest : rest.slice(0, open)).trim()
    if (moves) lines.push({ comment: false, text: moves })
    if (open < 0 || close < 0) break
    const comment = rest.slice(open + 1, close).trim()
    if (comment) lines.push({ comment: true, text: comment })
    rest = rest.slice(close + 1)
  }
  const firstMoves = lines.findIndex((l) => !l.comment)
  return { text: lines.map((l) => l.text).join('\n'), leading: firstMoves < 0 ? lines.length : firstMoves }
}

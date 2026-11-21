export type TextPart = { text: string } | { url: string }

const URL_RE = /https?:\/\/[^\s<>"']+/g

/** A text cut into plain pieces and http(s) urls; the punctuation that closes a sentence stays out of the url. */
export function splitUrls(input: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const m of input.matchAll(URL_RE)) {
    let url = m[0]
    while (/[.,;:!?)\]}]$/.test(url) && !(url.endsWith(')') && url.includes('('))) url = url.slice(0, -1)
    const start = m.index ?? 0
    if (start > last) parts.push({ text: input.slice(last, start) })
    parts.push({ url })
    last = start + url.length
  }
  if (last < input.length) parts.push({ text: input.slice(last) })
  return parts.length ? parts : [{ text: input }]
}

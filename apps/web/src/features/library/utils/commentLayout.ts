/**
 * The two ways a game's comments are written: in braces among the moves
 * ("2. Nf3 { The knight attacks e5. } Nc6") or as paragraphs after the moves,
 * as books print them. Converting keeps every move: a Black move that follows
 * a cut gets its number ("2... Nc6").
 */

const NUMBERED = /^\s*\d{1,3}(\.{1,3}|…)/
const MOVE = /(?:^|\s)(\d{1,3})(\.{3}|\.|…)?\s*(?:O-O(?:-O)?|[KQRBNDTAC]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBNDTAC])?)[+#]?[!?]*/g

/** The number and colour of the move that follows the text so far. */
function nextMove(before: string): { n: number; black: boolean } | null {
  let n = 0
  let black = false
  let seen = false
  for (const m of before.matchAll(MOVE)) {
    seen = true
    if (m[1] && m[2]) { n = Number(m[1]); black = m[2] !== '.' } else if (m[1] && !m[2]) { n = Number(m[1]); black = false }
    else black = !black
    if (m[1] && m[2] && m[2] !== '.') black = true
  }
  // `black` is the colour of the LAST move: the next is the other one.
  return seen ? (black ? { n: n + 1, black: false } : { n, black: true }) : null
}

/** Comments in braces → paragraphs after their move. */
export function bracesToParagraphs(text: string): string {
  let out = ''
  let rest = text
  for (;;) {
    const open = rest.indexOf('{')
    if (open < 0) { out += rest; break }
    const close = rest.indexOf('}', open)
    if (close < 0) { out += rest; break }
    const head = rest.slice(0, open).trimEnd()
    const comment = rest.slice(open + 1, close).trim()
    out += `${head}\n${comment}\n`
    rest = rest.slice(close + 1).trimStart()
    const next = nextMove(out)
    if (rest && next && !NUMBERED.test(rest)) rest = `${next.n}${next.black ? '...' : '.'} ${rest}`
  }
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/** A line with words and no move number at its start is a comment. */
const isProse = (line: string) => line.trim() !== '' && !NUMBERED.test(line) && /[A-Za-zÀ-ÿ]{3,}/.test(line.replace(MOVE, ' '))

/** Paragraphs between the moves → comments in braces after their move. */
export function paragraphsToBraces(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (isProse(line) && out.length && NUMBERED.test(out[out.length - 1].replace(/\{[^}]*\}/g, ''))) {
      out[out.length - 1] = `${out[out.length - 1]} { ${line.trim()} }`
    } else if (NUMBERED.test(line) && out.length && /\}\s*$/.test(out[out.length - 1])) {
      out[out.length - 1] = `${out[out.length - 1]} ${line.trim()}`
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}

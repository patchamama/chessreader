import { DIAGRAM_MARK } from '@chess-ebook/chess-shared'

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

/** A game result: it ends the game, no move follows it. */
const RESULT = /^(?:1-0|0-1|1\/2-1\/2|\*)(?![\w/-])/

/** Whether `text` is one balanced "( … )" group from end to end. */
function wholeParens(text: string): boolean {
  if (!text.startsWith('(') || !text.endsWith(')')) return false
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0 && i < text.length - 1) return false
  }
  return depth === 0
}

/**
 * A comment of the main line, tidied: when it is, or ends with, a parenthesised remark
 * ("(3... Rg6 then it ends.)", "if: (3... Rg6 then it ends.)") the parentheses go — a comment is
 * already set apart, so they only add noise. Variations (the parentheses of the move text) are not touched.
 */
function tidyComment(comment: string): string {
  if (wholeParens(comment)) return comment.slice(1, -1).trim()
  const tail = /^(.*?[:;,]\s+)(\(.*\))$/.exec(comment)
  if (tail && wholeParens(tail[2])) return `${tail[1]}${tail[2].slice(1, -1).trim()}`
  return comment
}

/** What opens a comment that continues the sentence before it ("{ , which … }"): not shown. */
const LEADING_PUNCTUATION = /^[,.;:]\s*/

/**
 * Comments in braces → paragraphs after their move. Parentheses are variations:
 * their comments stay INSIDE them, on the same line, without braces ("(6. Rc6?
 * { the king goes back } 6... Rd8)" → "(6. Rc6? the king goes back 6... Rd8)"); the
 * main line goes on in a new line after a variation ("(6... Rd8 7. Ta8#)\n7. Tc7"), and a move number is only added where
 * a black move continues a main line that a comment cut ("2... Nc6"), never in
 * front of a variation. A comment that opens with a comma or a period loses it.
 */
export function bracesToParagraphs(input: string): string {
  if (!input.includes('{')) return input
  // A comment that closes and another that opens right away ("} {", "}{") are one comment.
  const text = input.replace(/\}\s*\{/g, ' ')
  const lines: string[] = []
  let cur = ''
  let main = '' // the main line's moves so far (no comments, no variations): where the next number comes from
  let depth = 0
  let cut = false // a comment cut the main line: its continuation may need a move number
  let afterVariation = false
  const flush = () => { const t = cur.trim(); if (t) lines.push(t); cur = '' }
  const put = (chunk: string) => { cur += chunk; if (depth === 0) main += chunk }
  const space = () => { if (cur !== '' && !/[\s(]$/.test(cur)) cur += ' ' }

  for (let i = 0; i < text.length;) {
    const ch = text[i]
    if (ch === '{') {
      const close = text.indexOf('}', i)
      const comment = text.slice(i + 1, close < 0 ? text.length : close).replace(/\s+/g, ' ').trim()
      i = close < 0 ? text.length : close + 1
      if (depth > 0) {
        const punct = /^([,.;:])\s*(.*)$/.exec(comment)
        if (punct) { cur = cur.trimEnd() + punct[1]; if (punct[2]) cur += ` ${punct[2]}` } else if (comment) { space(); cur += comment }
      } else {
        flush()
        const shown = tidyComment(comment.replace(LEADING_PUNCTUATION, ''))
        if (shown) lines.push(shown)
        cut = true
      }
      continue
    }
    if (/\s/.test(ch)) {
      if (ch === '\n' && depth === 0) flush()
      else if (cur !== '' && !/\s$/.test(cur)) put(' ')
      i++
      continue
    }
    if (cut && depth === 0) {
      cut = false
      const next = nextMove(main)
      if (ch !== '(' && !NUMBERED.test(text.slice(i)) && !RESULT.test(text.slice(i)) && next) put(`${next.n}${next.black ? '...' : '.'} `)
    }
    if (afterVariation && depth === 0 && ch !== '(') {
      afterVariation = false
      // The main line goes on in a new line after a variation that closes: "(6... Rd8 7. Ta8#)\n7. Tc7"
      // (variations side by side stay together: only a "(" keeps the line).
      flush()
    }
    if (ch === '(') depth++
    else if (ch === ')' && depth > 0) { depth--; if (depth === 0) afterVariation = true }
    put(ch)
    i++
  }
  flush()
  return lines.join('\n').replace(/\n{2,}/g, '\n').trim()
}

/** A line with words and no move number at its start is a comment. */
const isProse = (line: string) => line.trim() !== '' && !NUMBERED.test(line) && /[A-Za-zÀ-ÿ]{3,}/.test(line.replace(MOVE, ' '))

/**
 * Paragraphs between the moves → comments in braces after their move. Which
 * lines hold moves is read from their move numbers, or told by `isMoveLine`
 * (line index → the line holds the game's own moves) when the caller knows
 * the game: books print moves without a dot ("8 axb5") and open comments with
 * a move ("13 h4!? (Petrosian-Ignatiev)").
 */
export function paragraphsToBraces(text: string, isMoveLine?: (index: number) => boolean): string {
  const lines = text.split('\n')
  const moves = (i: number) => (isMoveLine ? isMoveLine(i) : NUMBERED.test(lines[i]))
  const comment = (i: number) => {
    if (!isMoveLine) return isProse(lines[i])
    const line = lines[i].trim()
    return !isMoveLine(i) && line !== '' && line !== DIAGRAM_MARK
  }
  const out: string[] = []
  const moveLine: boolean[] = []
  lines.forEach((line, i) => {
    const last = out.length - 1
    if (last >= 0 && moveLine[last] && comment(i)) {
      out[last] = `${out[last]} { ${line.trim()} }`
    } else if (last >= 0 && moveLine[last] && moves(i) && /\}\s*$/.test(out[last])) {
      out[last] = `${out[last]} ${line.trim()}`
    } else {
      out.push(line)
      moveLine.push(moves(i))
    }
  })
  return out.join('\n')
}

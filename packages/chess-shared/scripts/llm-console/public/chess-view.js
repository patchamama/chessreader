// Small chess helpers for the console UI: a board thumbnail from a FEN and the highlighting of the moves written in a text.
// Browser: window.ConsoleChess. Tests: module.exports.
(function () {
  const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  /** The pieces of a FEN placement as 8 rows of 8 cells ('' = empty); null when it is not a placement. */
  function parsePlacement(fen) {
    const rows = String(fen ?? '').trim().split(/\s+/)[0].split('/')
    if (rows.length !== 8) return null
    const out = []
    for (const row of rows) {
      const cells = []
      for (const ch of row) {
        if (/[1-8]/.test(ch)) for (let i = 0; i < Number(ch); i++) cells.push('')
        else if (GLYPH[ch]) cells.push(ch)
        else return null
      }
      if (cells.length !== 8) return null
      out.push(cells)
    }
    return out
  }

  /** An SVG board (white at the bottom) for a FEN; the empty string when the FEN cannot be read. `mark` lights one square ("e4"). */
  function boardSvg(fen, { size = 160, mark } = {}) {
    const board = parsePlacement(fen)
    if (!board) return ''
    const sq = size / 8
    const markFile = mark ? 'abcdefgh'.indexOf(mark[0]) : -1
    const markRank = mark ? 8 - Number(mark[1]) : -1
    let body = ''
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const dark = (r + f) % 2 === 1
        const fill = r === markRank && f === markFile ? '#f6e05e' : dark ? '#b58863' : '#f0d9b5'
        body += `<rect x="${f * sq}" y="${r * sq}" width="${sq}" height="${sq}" fill="${fill}"/>`
        const p = board[r][f]
        if (p) body += `<text x="${f * sq + sq / 2}" y="${r * sq + sq * 0.78}" font-size="${sq * 0.82}" text-anchor="middle" fill="${p === p.toUpperCase() ? '#fff' : '#111'}" stroke="${p === p.toUpperCase() ? '#111' : 'none'}" stroke-width="${sq * 0.03}">${GLYPH[p]}</text>`
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(fen)}">${body}</svg>`
  }

  // A move in any usual notation (English, Spanish, German, French letters or figurines), with an optional move number.
  const MOVE = /(?<![\wÀ-ɏ])(?:\d+\s*(?:\.\.\.|…|\.)\s*)?(?:[KQRBNDTACLSF♔♕♖♗♘♚♛♜♝♞]?[a-h]?[1-8]?[x:]?[a-h][1-8](?:=?[QRBNDTACLSF])?|[O0]-[O0](?:-[O0])?)[+#]?[!?]*(?![\wÀ-ɏ])/gu

  /** The text escaped as HTML with every move wrapped in <mark class="mv">. */
  function highlightMoves(text) {
    const s = String(text ?? '')
    let out = '', at = 0
    for (const m of s.matchAll(MOVE)) {
      out += esc(s.slice(at, m.index)) + `<mark class="mv">${esc(m[0])}</mark>`
      at = m.index + m[0].length
    }
    return out + esc(s.slice(at))
  }

  /** "after 13. Bc4" / "after 13... Bc4" for a ply and its SAN; "initial position" without a move. */
  function afterLabel(ply, san, labels = { after: 'after', initial: 'initial position' }) {
    if (!san || !ply) return labels.initial
    return `${labels.after} ${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'} ${san}`
  }

  const api = { parsePlacement, boardSvg, highlightMoves, afterLabel }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.ConsoleChess = api
})()

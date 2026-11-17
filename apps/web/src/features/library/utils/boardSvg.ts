const GLYPH: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

/**
 * A plain board drawing of a position (SVG, no external images), for diagrams
 * written into a commented game. Works offline and in the static demo; the
 * reader can still switch it to the backend-rendered board.
 */
export function boardSvg(fen: string, size = 320): string {
  const cell = size / 8
  const rows = fen.split(' ')[0].split('/')
  const parts: string[] = []
  for (let r = 0; r < 8; r++) {
    let f = 0
    for (const ch of rows[r] ?? '') {
      if (/\d/.test(ch)) {
        for (let k = 0; k < Number(ch); k++, f++) parts.push(square(r, f, cell))
      } else {
        parts.push(square(r, f, cell))
        parts.push(`<text x="${(f + 0.5) * cell}" y="${(r + 0.5) * cell}" font-size="${cell * 0.8}" text-anchor="middle" dominant-baseline="central" fill="#111">${GLYPH[ch] ?? ''}</text>`)
        f++
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${parts.join('')}</svg>`
}

function square(r: number, f: number, cell: number): string {
  const light = (r + f) % 2 === 0
  return `<rect x="${f * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${light ? '#f0d9b5' : '#b58863'}"/>`
}

export const boardSvgDataUrl = (fen: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(boardSvg(fen))}`

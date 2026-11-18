// Checks the boards read from diagram images (scripts/diagram_fen.py) against
// the moves that follow each diagram in the book: the side to move and the
// move number come from the first numbered move after the diagram ("23 Txe5",
// "23…Cf6"); the FEN is accepted only when the recogniser, started from it,
// reads at least three moves of that text with no error.
// Usage: node scripts/validate-diagram-fens.mjs <book.epub> <fens.json> <out.json>
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { recognizeGames, figurineToAscii, spanishToEnglish } from '../dist/index.js'

const [epub, fensFile, out] = process.argv.slice(2)
const read = new Map(JSON.parse(readFileSync(fensFile, 'utf8')).filter((d) => epub.endsWith(d.book)).map((d) => [d.image.split('/').pop(), d]))
const dir = mkdtempSync(join(tmpdir(), 'dfen-'))
execFileSync('unzip', ['-q', '-o', epub, '-d', dir])
const textDir = readdirSync(dir, { recursive: true }).filter((f) => /\.x?html?$/.test(f)).sort()
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
let total = 0, printed = 0, tried = 0, ok = 0
const accepted = {}
for (const f of textDir) {
  const html = readFileSync(join(dir, f), 'utf8')
  const parts = html.split(/<img[^>]*src="([^"]+)"[^>]*>/)
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i].split('/').pop()
    const d = read.get(name)
    if (!d) continue
    total++
    if (d.printed) { printed++; continue }
    const after = spanishToEnglish(figurineToAscii(strip(parts[i + 1] ?? '').slice(0, 400)))
    const m = /(?:^|\s)(\d{1,3})(\.{3}|…|\.)?\s*(?=[KQRBNO]?[a-h1-8x]*[a-h][1-8]|O-O)/.exec(after)
    if (!m) continue
    const black = m[2] === '...' || m[2] === '…'
    const fen = `${d.read} ${black ? 'b' : 'w'} - - 0 ${m[1]}`
    try { new Chess(fen) } catch { continue }
    tried++
    const [g] = recognizeGames(`${fen}\n${after.slice(m.index)}`, { algorithm: 1 })
    if (g && g.tree.startFen === fen && g.tree.mainline.length >= 3 && g.tree.errors.length === 0) { ok++; accepted[name] = fen }
  }
}
writeFileSync(out, JSON.stringify(accepted))
console.log(`${epub.split('/').pop()}: diagrams ${total}, with printed FEN ${printed}, board+moves checkable ${tried}, accepted ${ok}`)

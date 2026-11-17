// Builds public/openings/eco.json from the lichess-org/chess-openings TSV
// files (CC0): every position of every named line, keyed by its EPD (FEN
// without the move counters), with the ECO code and name. A position that
// ends a named line takes that name; a position on the way takes the name of
// the shortest line through it.
// Usage: node scripts/build-eco.mjs <dir with a.tsv … e.tsv>
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'

const dir = process.argv[2]
const exact = new Map()
const through = new Map()
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  for (const row of readFileSync(join(dir, `${f}.tsv`), 'utf8').split('\n').slice(1)) {
    const [eco, name, pgn] = row.split('\t')
    if (!pgn) continue
    const chess = new Chess()
    const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/)
    sans.forEach((san, i) => {
      chess.move(san)
      const epd = chess.fen().split(' ').slice(0, 4).join(' ')
      if (i === sans.length - 1) { if (!exact.has(epd)) exact.set(epd, [eco, name]) }
      else {
        const old = through.get(epd)
        if (!old || old[2] > sans.length) through.set(epd, [eco, name, sans.length])
      }
    })
  }
}
const out = {}
for (const [epd, v] of through) out[epd] = [v[0], v[1]]
for (const [epd, v] of exact) out[epd] = v
writeFileSync(new URL('../public/openings/eco.json', import.meta.url), JSON.stringify(out))
console.log(Object.keys(out).length, 'positions')

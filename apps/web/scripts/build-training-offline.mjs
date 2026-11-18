// Builds public/training/level.json — the puzzles of the level test — from
// the bundled pattern puzzles (public/patterns, Lichess puzzle database, CC0),
// so the level test needs no connection to Lichess: for every 100-point
// rating band from 400 to 3000, a few puzzles of different themes.
// Usage: node scripts/build-training-offline.mjs [perBand=8]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PER_BAND = Number(process.argv[2] ?? 8)
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const patterns = join(root, 'patterns')
const bands = new Map()
for (const file of readdirSync(patterns).filter((f) => f.endsWith('.json') && f !== 'index.json').sort()) {
  const theme = file.replace(/\.json$/, '')
  for (const [id, fen, moves, rating] of JSON.parse(readFileSync(join(patterns, file), 'utf8'))) {
    const band = Math.floor(rating / 100) * 100
    if (!bands.has(band)) bands.set(band, [])
    bands.get(band).push([id, fen, moves, rating, theme])
  }
}
const out = []
const seen = new Set()
for (const band of [...bands.keys()].sort((a, b) => a - b)) {
  const used = new Set()
  // One puzzle per theme first, so a band mixes patterns.
  for (const row of bands.get(band)) {
    if (out.filter((r) => Math.floor(r[3] / 100) * 100 === band).length >= PER_BAND) break
    if (used.has(row[4]) || seen.has(row[0])) continue
    used.add(row[4]); seen.add(row[0]); out.push(row)
  }
}
mkdirSync(join(root, 'training'), { recursive: true })
writeFileSync(join(root, 'training', 'level.json'), JSON.stringify(out))
console.log(out.length, 'level puzzles in', bands.size, 'bands')

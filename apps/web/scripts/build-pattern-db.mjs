// Builds public/patterns/ from the Lichess puzzle database (CC0,
// https://database.lichess.org/#puzzles): for each tactical theme, popular
// puzzles spread over four rating bands, so the pattern trainer has examples
// from easy to hard.
// Usage: node scripts/build-pattern-db.mjs <lichess_db_puzzle.csv> [perBand=30]
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const [csv, perBandArg] = process.argv.slice(2)
const PER_BAND = Number(perBandArg ?? 30)
const BANDS = [[0, 1200], [1200, 1600], [1600, 2000], [2000, 4000]]
// Themes that say the length or the phase, not a pattern.
const SKIP = new Set(['short', 'long', 'veryLong', 'oneMove', 'middlegame', 'endgame', 'opening', 'crushing', 'advantage', 'equality', 'master', 'masterVsMaster', 'superGM', 'player'])
const LABELS = {
  fork: ['Fork', 'Ataque doble'], pin: ['Pin', 'Clavada'], skewer: ['Skewer', 'Enfilada'], discoveredAttack: ['Discovered attack', 'Ataque a la descubierta'],
  doubleCheck: ['Double check', 'Jaque doble'], hangingPiece: ['Hanging piece', 'Pieza colgada'], trappedPiece: ['Trapped piece', 'Pieza atrapada'],
  sacrifice: ['Sacrifice', 'Sacrificio'], deflection: ['Deflection', 'Desviación'], attraction: ['Attraction', 'Atracción'], clearance: ['Clearance', 'Despeje'],
  interference: ['Interference', 'Interferencia'], intermezzo: ['Intermezzo', 'Jugada intermedia'], xRayAttack: ['X-ray attack', 'Rayos X'],
  zugzwang: ['Zugzwang', 'Zugzwang'], quietMove: ['Quiet move', 'Jugada tranquila'], defensiveMove: ['Defensive move', 'Jugada defensiva'],
  capturingDefender: ['Capture the defender', 'Eliminar al defensor'], exposedKing: ['Exposed king', 'Rey expuesto'], kingsideAttack: ['Kingside attack', 'Ataque al flanco de rey'],
  queensideAttack: ['Queenside attack', 'Ataque al flanco de dama'], advancedPawn: ['Advanced pawn', 'Peón avanzado'], promotion: ['Promotion', 'Coronación'],
  underPromotion: ['Underpromotion', 'Subpromoción'], enPassant: ['En passant', 'Al paso'], castling: ['Castling', 'Enroque'],
  mate: ['Checkmate', 'Jaque mate'], mateIn1: ['Mate in 1', 'Mate en 1'], mateIn2: ['Mate in 2', 'Mate en 2'], mateIn3: ['Mate in 3', 'Mate en 3'],
  backRankMate: ['Back-rank mate', 'Mate del pasillo'], smotheredMate: ['Smothered mate', 'Mate ahogado'], anastasiaMate: ["Anastasia's mate", 'Mate de Anastasia'],
  arabianMate: ['Arabian mate', 'Mate árabe'], bodenMate: ["Boden's mate", 'Mate de Boden'], doubleBishopMate: ['Double bishop mate', 'Mate de los dos alfiles'],
  dovetailMate: ['Dovetail mate', 'Mate de la cola de paloma'], hookMate: ['Hook mate', 'Mate del gancho'], killBoxMate: ['Kill box mate', 'Mate de la caja'],
  vukovicMate: ['Vukovic mate', 'Mate de Vukovic'], operaMate: ['Opera mate', 'Mate de la Ópera'], pillsburysMate: ["Pillsbury's mate", 'Mate de Pillsbury'],
  morphysMate: ["Morphy's mate", 'Mate de Morphy'], balestraMate: ['Balestra mate', 'Mate de la ballesta'], blindSwineMate: ['Blind swine mate', 'Mate de los cerdos ciegos'],
  triangleMate: ['Triangle mate', 'Mate del triángulo'], cornerMate: ['Corner mate', 'Mate en la esquina'],
  rookEndgame: ['Rook endgame', 'Final de torres'], pawnEndgame: ['Pawn endgame', 'Final de peones'], bishopEndgame: ['Bishop endgame', 'Final de alfiles'],
  knightEndgame: ['Knight endgame', 'Final de caballos'], queenEndgame: ['Queen endgame', 'Final de damas'], queenRookEndgame: ['Queen and rook', 'Dama y torre'],
}

const buckets = new Map()
const rl = createInterface({ input: createReadStream(csv) })
let header = true
for await (const line of rl) {
  if (header) { header = false; continue }
  const [id, fen, moves, rating, , popularity, plays, themes] = line.split(',')
  if (Number(popularity) < 85 || Number(plays) < 300) continue
  const band = BANDS.findIndex(([a, b]) => Number(rating) >= a && Number(rating) < b)
  for (const theme of themes.split(' ')) {
    if (SKIP.has(theme) || !LABELS[theme]) continue
    const b = buckets.get(theme) ?? buckets.set(theme, BANDS.map(() => [])).get(theme)
    if (b[band].length < PER_BAND) b[band].push([id, fen, moves, Number(rating)])
  }
}
const out = new URL('../public/patterns/', import.meta.url)
mkdirSync(out, { recursive: true })
const index = []
for (const [theme, bands] of buckets) {
  const puzzles = bands.flat().sort((a, b) => a[3] - b[3])
  if (puzzles.length < 10) continue
  writeFileSync(new URL(`${theme}.json`, out), JSON.stringify(puzzles))
  index.push({ theme, en: LABELS[theme][0], es: LABELS[theme][1], count: puzzles.length })
}
index.sort((a, b) => a.en.localeCompare(b.en))
writeFileSync(new URL('index.json', out), JSON.stringify({ source: 'Lichess puzzle database (CC0), https://database.lichess.org/#puzzles', themes: index }, null, 1))
console.log(index.length, 'themes', index.reduce((s, t) => s + t.count, 0), 'puzzles')

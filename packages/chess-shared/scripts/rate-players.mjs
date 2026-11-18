// Judges every player of the game database by the engines: in each game, the
// accuracy of his moves against Stockfish (Lichess formula), how often he
// played Stockfish's first choice, and how often the move a 1900 player would
// choose (Maia, through lc0). Fills db_player_ratings in games.sqlite.
// Usage: node scripts/rate-players.mjs <games.sqlite> [depth=8] [maia weights file]
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { Chess } from 'chess.js'
import { recognizeGames, reviewGame } from '../dist/index.js'

const [file, depthArg, maiaWeights] = process.argv.slice(2)
const DEPTH = Number(depthArg ?? 8)
const db = new DatabaseSync(file)
function engine(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'ignore'] }); let buf = ''; let waiter = null
  p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); waiter?.(l) } })
  return { p, send: (s) => p.stdin.write(s + '\n'), until: (pred) => new Promise((res) => { waiter = (l) => { if (pred(l)) { waiter = null; res(l) } } }) }
}
const sf = engine('stockfish', []); sf.send('uci'); sf.send('setoption name Threads value 6'); sf.send('isready'); await sf.until((l) => l === 'readyok')
const maia = maiaWeights ? engine('lc0', [`--weights=${maiaWeights}`]) : null
if (maia) { maia.send('uci'); maia.send('isready'); await maia.until((l) => l === 'readyok') }
async function sfEval(fen) {
  let last = ''
  sf.send('position fen ' + fen); sf.send('go depth ' + DEPTH)
  const best = await new Promise((res) => { const prev = (l) => { if (l.startsWith('info') && l.includes(' score ')) last = l; if (l.startsWith('bestmove')) res(l.split(' ')[1]); else return false }; sf.until((l) => prev(l) !== false) })
  const m = / score (cp|mate) (-?\d+)/.exec(last); const sign = fen.split(' ')[1] === 'w' ? 1 : -1
  return { best, score: !m ? { cp: 0 } : m[1] === 'cp' ? { cp: sign * Number(m[2]) } : { mate: sign * Number(m[2]) } }
}
async function maiaBest(fen) { maia.send('position fen ' + fen); maia.send('go nodes 1'); return (await maia.until((l) => l.startsWith('bestmove'))).split(' ')[1] }
db.exec('DELETE FROM db_player_ratings')
const ins = db.prepare('INSERT INTO db_player_ratings (game_id, color, player, accuracy, maia_agreement, engine_agreement) VALUES (?, ?, ?, ?, ?, ?)')
const rows = db.prepare("SELECT id, white, black, pgn FROM db_games WHERE white IS NOT NULL AND black IS NOT NULL").all()
let done = 0
for (const g of rows) {
  const [game] = recognizeGames(g.pgn, { algorithm: 1 })
  if (!game) continue
  const nodes = game.tree.mainline.map((id) => game.tree.nodes.get(id)).slice(0, 120)
  const fens = [game.tree.startFen, ...nodes.map((n) => n.fen)]
  const evals = []
  for (const fen of fens) {
    const c = new Chess(fen)
    evals.push(c.isGameOver() ? { best: null, score: c.isCheckmate() ? { mate: c.turn() === 'w' ? -1 : 1 } : { cp: 0 } } : await sfEval(fen))
  }
  const agree = { white: [0, 0, 0], black: [0, 0, 0] }
  const plies = []
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]; const uci = `${n.from}${n.to}`
    const a = agree[n.color]; a[0]++
    if (evals[i].best?.slice(0, 4) === uci) a[1]++
    if (maia && (await maiaBest(fens[i]))?.slice(0, 4) === uci) a[2]++
    plies.push({ nodeId: n.id, san: n.san, color: n.color, moveNumber: n.moveNumber, from: n.from, to: n.to, fenBefore: fens[i], fenAfter: n.fen, before: evals[i].score, after: evals[i + 1].score })
  }
  const review = reviewGame(plies)
  for (const color of ['white', 'black']) {
    const a = agree[color]
    ins.run(g.id, color, g[color], review[color].accuracy, maia ? a[2] / Math.max(1, a[0]) : null, a[1] / Math.max(1, a[0]))
  }
  if (++done % 50 === 0) console.error(`${done}/${rows.length}`)
  // Partial results along the way: the ranking is usable before the end.
  if (done % 100 === 0) exportRatings(db, file.replace(/games\.sqlite$/, 'ratings.json'))
}
sf.p.kill(); maia?.p.kill()
console.log(`rated ${done} games`)
exportRatings(db, file.replace(/games\.sqlite$/, 'ratings.json'))

/** Per player (by surname): games, average accuracy and agreements, near-perfect games (accuracy ≥ 95). */
function exportRatings(db, out) {
  const rows = db.prepare('SELECT r.*, g.white, g.black, g.year, g.book_id FROM db_player_ratings r JOIN db_games g ON g.id = r.game_id').all()
  const by = new Map()
  for (const r of rows) {
    const key = r.player.split(' ').pop()
    const p = by.get(key) ?? by.set(key, { player: key, names: new Set(), games: 0, accuracy: 0, engine: 0, maia: 0, maiaN: 0, perfect: [] }).get(key)
    p.names.add(r.player); p.games++; p.accuracy += r.accuracy ?? 0; p.engine += r.engine_agreement ?? 0
    if (r.maia_agreement !== null) { p.maia += r.maia_agreement; p.maiaN++ }
    if ((r.accuracy ?? 0) >= 95) p.perfect.push({ game: r.game_id, accuracy: r.accuracy, color: r.color, white: r.white, black: r.black, year: r.year, book: r.book_id })
  }
  const list = [...by.values()].map((p) => ({ player: p.player, names: [...p.names], games: p.games,
    accuracy: Math.round((p.accuracy / p.games) * 10) / 10, engineAgreement: Math.round((p.engine / p.games) * 1000) / 10,
    maiaAgreement: p.maiaN ? Math.round((p.maia / p.maiaN) * 1000) / 10 : null, nearPerfect: p.perfect.sort((a, b) => b.accuracy - a.accuracy) }))
    .sort((a, b) => b.accuracy - a.accuracy)
  writeFileSync(out, JSON.stringify({ engine: `Stockfish depth ${DEPTH}`, maia: maiaWeights ? 'Maia 1900' : null, players: list }))
  console.log(`ratings: ${list.length} players`)
}

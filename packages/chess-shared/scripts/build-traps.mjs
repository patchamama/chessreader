// Builds traps.json from the EPUB of "Aprende a hacer trampas al ajedrez"
// (N. Lococo Cobo): every trap with its chapter (kind of trap), opening, the
// side that sets it, the move where it happens, the three ratings the book
// draws as images (_1.jpg … _5.jpg: setup chance, fall chance, tactical
// level), its tactical themes, the introduction and the main line (the moves
// in bold), with the position keys of the line for matching games.
// Book content: the output goes to the private resources repository only.
// Usage: node scripts/build-traps.mjs <book.epub> <out.json>
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { figurineToAscii, spanishToEnglish, positionHash, recognizeGames } from '../dist/index.js'

const [epub, out] = process.argv.slice(2)
const dir = mkdtempSync(join(tmpdir(), 'traps-'))
execFileSync('unzip', ['-q', '-o', epub, '-d', dir])
const textDir = join(dir, 'OEBPS', 'Text')
const files = readdirSync(textDir).filter((f) => f.endsWith('.xhtml')).sort()
const strip = (h) => h.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
const traps = []
let chapter = ''
let title = ''
for (const f of files) {
  const html = readFileSync(join(textDir, f), 'utf8')
  // Walk the file in order: chapter titles (h1), trap names (h3), and each
  // example: its opening (h5), its table and its moves until the next rule.
  const re = /<h1[^>]*>([\s\S]*?)<\/h1>|<span class="h3">([\s\S]*?)<\/span>|<table>([\s\S]*?)<\/table>/g
  let m
  while ((m = re.exec(html)) !== null) {
    if (m[1]) { chapter = strip(m[1]).replace(/\s+/g, ' '); continue }
    if (m[2]) { title = strip(m[2]).replace(/^[\d.]+\s*/, ''); continue }
    const table = m[3]
    const field = (name) => { const x = new RegExp(`<td>${name}</td><td>([\\s\\S]*?)</td>`).exec(table); return x ? x[1] : null }
    const level = (name) => { const x = /(?:^|["/])_([1-5])\.jpg/.exec(field(name) ?? ''); return x ? Number(x[1]) : null }
    const side = strip(field('Trampa') ?? '')
    if (!side) continue
    const before = html.slice(Math.max(0, m.index - 600), m.index)
    const opening = strip([...before.matchAll(/class="h5">([\s\S]*?)<\/span>/g)].pop()?.[1] ?? '')
    const rest = html.slice(re.lastIndex)
    const end = rest.search(/<p class="raya1"|<table>|<span class="h3">/)
    const body = end < 0 ? rest : rest.slice(0, end)
    const intro = strip(/^\s*(?:<p class="empty-line"\/>\s*)*<p>([\s\S]*?)<\/p>/.exec(body)?.[1] ?? '')
    const bold = [...body.matchAll(/<b>([\s\S]*?)<\/b>/g)].map((x) => strip(x[1])).join(' ')
    const text = spanishToEnglish(figurineToAscii(bold)).replace(/(\d+)\s*\.{3}\s*/g, '$1... ').replace(/(\d+)\s*…\s*/g, '$1... ')
    const [game] = recognizeGames(text, { algorithm: 1 })
    if (!game || game.tree.mainline.length < 3) continue
    const sans = game.tree.mainline.map((id) => game.tree.nodes.get(id).san)
    const chess = new Chess()
    const keys = [positionHash(chess.fen())]
    for (const san of sans) { chess.move(san); keys.push(positionHash(chess.fen())) }
    traps.push({
      id: `lococo-${traps.length + 1}`, title, category: chapter, opening, side: /blanc/i.test(side) ? 'white' : 'black',
      trapMove: Number(/\d+/.exec(strip(field('Movimiento de la celada') ?? ''))?.[0] ?? 0) || null,
      setup: level('Posibilidad de planteamiento'), fall: level('Probabilidad de que caigan'), tactic: level('Nivel táctico de ejecución'),
      themes: strip(field('Temas tácticos') ?? '').split('\n').map((x) => x.trim()).filter(Boolean),
      intro, sans, keys, source: { title: 'Aprende a hacer trampas al ajedrez', author: 'Nicolás Lococo Cobo' },
    })
  }
}
writeFileSync(out, JSON.stringify(traps))
console.log(traps.length, 'traps')

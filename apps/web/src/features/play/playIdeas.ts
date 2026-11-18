import { openingName, opportunities, positionIdeas, type Lang } from '@chess-ebook/chess-shared'
export { lichessThemes } from '../../shared/chess/lichessThemes'

const NAME: Record<Lang, Record<string, string>> = {
  en: { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king', hanging: 'can be taken', loose: 'is not defended', isolated: 'isolated pawn', doubled: 'doubled pawn', outpost: 'a square for your knight or bishop' },
  es: { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey', hanging: 'se puede tomar', loose: 'no está defendido', isolated: 'peón aislado', doubled: 'peón doblado', outpost: 'una casilla para tu caballo o alfil' },
  de: { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König', hanging: 'kann geschlagen werden', loose: 'ist ungedeckt', isolated: 'isolierter Bauer', doubled: 'Doppelbauer', outpost: 'ein Feld für deinen Springer oder Läufer' },
}

export interface PlayIdeas {
  opening: string | null
  /** Squares worth aiming at: the opponent's weak or loose pieces and pawns. */
  targets: { square: string; why: string }[]
  /** What the side to move can do now (mate, a capture, a fork…). */
  chances: string[]
}

/** Ideas for the player on move: the opening, weak points of the opponent, and immediate chances. */
export function playIdeas(fen: string, sans: string[], me: 'white' | 'black', lang: Lang): PlayIdeas {
  const n = NAME[lang] ?? NAME.en
  const ideas = positionIdeas(fen)
  const them = me === 'white' ? 'black' : 'white'
  const targets: { square: string; why: string }[] = []
  const add = (square: string, why: string) => { if (!targets.some((t) => t.square === square)) targets.push({ square, why }) }
  for (const h of ideas.hanging) if (h.color === them) add(h.square, `${n[h.piece]} ${n.hanging}`)
  for (const l of ideas.loose) if (l.color === them) add(l.square, `${n[l.piece]} ${n.loose}`)
  for (const p of ideas.isolatedPawns) if (p.color === them) add(p.square, n.isolated)
  for (const p of ideas.doubledPawns) if (p.color === them) add(p.square, n.doubled)
  const myTurn = (fen.split(' ')[1] === 'w') === (me === 'white')
  let chances: string[] = []
  try { chances = myTurn ? opportunities(fen, lang).map((o) => o.text) : [] } catch { /* not a playable position */ }
  return { opening: sans.length <= 24 ? openingName(sans, lang) : null, targets: targets.slice(0, 6), chances: chances.slice(0, 3) }
}

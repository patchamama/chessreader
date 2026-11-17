import { Chess, type Square } from 'chess.js';
import type { Lang } from './concepts.js';
import { moveMotifs, motifText, type Motif } from './gameReview.js';

/**
 * The tutor of a live game: what the side to move could do right now
 * (opportunities), what the opponent's last move is up to, and the idea of the
 * player's own move — from the board alone, so it works without an engine.
 */
export interface Opportunity { kind: 'mate' | 'capture' | 'fork' | 'check-win'; san: string; text: string }

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const PIECE: Record<Lang, Record<string, string>> = {
  es: { p: 'el peón', n: 'el caballo', b: 'el alfil', r: 'la torre', q: 'la dama', k: 'el rey' },
  en: { p: 'the pawn', n: 'the knight', b: 'the bishop', r: 'the rook', q: 'the queen', k: 'the king' },
  de: { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' },
};
const LETTERS: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' };
const local = (san: string, lang: Lang) => (lang === 'es' ? san.replace(/^[KQRBN]/, (c) => LETTERS[c]) : san);
const on = (lang: Lang) => (lang === 'es' ? 'de' : lang === 'en' ? 'on' : 'auf');

export function opportunities(fen: string, lang: Lang): Opportunity[] {
  const chess = new Chess(fen);
  const out: Opportunity[] = [];
  const foe = chess.turn() === 'w' ? 'b' : 'w';
  for (const mv of chess.moves({ verbose: true })) {
    chess.move(mv);
    const mate = chess.isCheckmate();
    const takenBack = chess.attackers(mv.to as Square, foe).length > 0;
    chess.undo();
    const san = local(mv.san, lang);
    if (mate) {
      out.push({ kind: 'mate', san: mv.san, text: lang === 'es' ? `Tienes mate: ${san}.` : lang === 'en' ? `You have mate: ${san}.` : `Du hast Matt: ${san}.` });
      continue;
    }
    if (mv.captured) {
      const gain = VALUE[mv.captured] - (takenBack ? VALUE[mv.piece] : 0);
      if (gain >= 2) {
        const what = `${PIECE[lang][mv.captured]} ${on(lang)} ${mv.to}`;
        out.push({ kind: 'capture', san: mv.san, text: lang === 'es' ? `Pieza gratis: ${san} gana ${what}.` : lang === 'en' ? `A free piece: ${san} wins ${what}.` : `Eine freie Figur: ${san} gewinnt ${what}.` });
      }
      continue;
    }
    const fork = moveMotifs(fen, mv.san).find((m) => m.kind === 'fork');
    if (fork) {
      const after = new Chess(fen);
      after.move(mv.san);
      out.push({ kind: 'fork', san: mv.san, text: `${lang === 'es' ? 'Posible' : lang === 'en' ? 'Possible' : 'Möglich'}: ${san}. ${motifText(fork, after.fen(), lang)}` });
    }
  }
  const rank = { mate: 0, capture: 1, fork: 2, 'check-win': 3 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 3);
}

/** Motifs worth a warning when the opponent plays them. */
const WARN = new Set<Motif['kind']>(['threat', 'fork', 'attack-undefended', 'pin', 'skewer', 'discovered-attack', 'joint-attack', 'traps', 'mate', 'check', 'double-check', 'discovered-check']);

export function opponentIntent(fenBefore: string, san: string, lang: Lang): string[] {
  const chess = new Chess(fenBefore);
  try { chess.move(san); } catch { return []; }
  return moveMotifs(fenBefore, san).filter((m) => WARN.has(m.kind)).slice(0, 3).map((m) => motifText(m, chess.fen(), lang)).filter(Boolean);
}

/** The idea of a move (what it creates on the board). */
export function explainMove(fenBefore: string, san: string, lang: Lang): string[] {
  const chess = new Chess(fenBefore);
  try { chess.move(san); } catch { return []; }
  return moveMotifs(fenBefore, san).filter((m) => m.kind !== 'capture').slice(0, 3).map((m) => motifText(m, chess.fen(), lang)).filter(Boolean);
}

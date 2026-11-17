import { Chess, type Square } from 'chess.js';
import type { Lang } from './concepts.js';
import { moveMotifs, motifText, type GameReview, type Motif, type PlyInput } from './gameReview.js';

/**
 * A master going through a game the user played: for the side the user chose
 * (or both), every error with what it allowed and what the better move did,
 * captures left on the board, the good moves; for the opponent, what each move
 * is up to. The level sets how much is said:
 *  1 — the real errors (mistakes, blunders) and free pieces left;
 *  2 — + inaccuracies, the opponent's threats and ideas, the good moves;
 *  3 — + the idea behind every move of the player.
 * Remarks are per ply (1-based), ready for annotateGame({ remarks }).
 */
export interface CoachOptions {
  focus: 'white' | 'black' | 'both';
  level: 1 | 2 | 3;
  lang: Lang;
}
export interface CoachResult {
  remarks: Record<number, string>;
  intro: string;
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const PIECE: Record<Lang, Record<string, string>> = {
  es: { p: 'el peón', n: 'el caballo', b: 'el alfil', r: 'la torre', q: 'la dama', k: 'el rey' },
  en: { p: 'the pawn', n: 'the knight', b: 'the bishop', r: 'the rook', q: 'the queen', k: 'the king' },
  de: { p: 'den Bauern', n: 'den Springer', b: 'den Läufer', r: 'den Turm', q: 'die Dame', k: 'den König' },
};
const W = {
  es: { blunder: 'Error grave', mistake: 'Error', dubious: 'Imprecisión', good: 'Buena jugada', brilliant: '¡Jugada brillante!',
    better: 'Era mejor', allowsMate: (sq: string) => `Permite el mate en ${sq}.`, allowsWin: (san: string) => `Permite ${san}, que gana material.`,
    watch: 'Atención: el rival', idea: 'Atención, idea del rival', title: (side: string) => `Revisión del maestro para las ${side}`,
    errs: ['error grave', 'errores graves', 'error', 'errores', 'imprecisión', 'imprecisiones', 'buena jugada', 'buenas jugadas'], move: 'jugada', moves: 'jugadas',
    clean: 'sin errores serios', white: 'blancas', black: 'negras', both: 'blancas y negras' },
  en: { blunder: 'Blunder', mistake: 'Mistake', dubious: 'Inaccuracy', good: 'Good move', brilliant: 'Brilliant move!',
    better: 'Better was', allowsMate: (sq: string) => `It allows mate on ${sq}.`, allowsWin: (san: string) => `It allows ${san}, which wins material.`,
    watch: 'Careful: the opponent', idea: 'Careful, the opponent has an idea', title: (side: string) => `Coach review for ${side}`,
    errs: ['blunder', 'blunders', 'mistake', 'mistakes', 'inaccuracy', 'inaccuracies', 'good move', 'good moves'], move: 'move', moves: 'moves',
    clean: 'no serious errors', white: 'White', black: 'Black', both: 'both sides' },
  de: { blunder: 'Grober Fehler', mistake: 'Fehler', dubious: 'Ungenauigkeit', good: 'Guter Zug', brilliant: 'Glänzender Zug!',
    better: 'Besser war', allowsMate: (sq: string) => `Erlaubt Matt auf ${sq}.`, allowsWin: (san: string) => `Erlaubt ${san}, das Material gewinnt.`,
    watch: 'Achtung: der Gegner', idea: 'Achtung, Idee des Gegners', title: (side: string) => `Trainer-Analyse für ${side}`,
    errs: ['grober Fehler', 'grobe Fehler', 'Fehler', 'Fehler', 'Ungenauigkeit', 'Ungenauigkeiten', 'guter Zug', 'gute Züge'], move: 'Zug', moves: 'Züge',
    clean: 'keine ernsten Fehler', white: 'Weiß', black: 'Schwarz', both: 'beide Seiten' },
};
const MISSED = {
  es: (san: string, what: string) => `Dejaste pasar una captura gratis: ${san} ganaba ${what}.`,
  en: (san: string, what: string) => `You let a free capture go: ${san} won ${what}.`,
  de: (san: string, what: string) => `Du hast einen freien Schlag ausgelassen: ${san} gewann ${what}.`,
};
const LETTERS: Partial<Record<Lang, Record<string, string>>> = {
  es: { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' },
  de: { K: 'K', Q: 'D', R: 'T', B: 'L', N: 'S' },
};
/** A move in the piece letters of the language. */
const localSan = (san: string, lang: Lang) => (LETTERS[lang] ? san.replace(/^[KQRBN]/, (c) => LETTERS[lang]![c]).replace(/=([QRBN])/, (_m, c: string) => `=${LETTERS[lang]![c]}`) : san);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** Motifs worth saying about an opponent's move: what it threatens or prepares. */
const WARN = new Set<Motif['kind']>(['threat', 'mate-threat', 'fork', 'attack-undefended', 'aims-at', 'pin', 'skewer', 'discovered-attack', 'joint-attack', 'traps', 'combination']);
const PLAIN = new Set<Motif['kind']>(['capture', 'check']);

/** The best capture of a piece that nothing defends (or worth more than the taker), for the side to move. */
function freeCapture(fen: string): { san: string; piece: string; square: string; value: number } | null {
  const chess = new Chess(fen);
  let best: { san: string; piece: string; square: string; value: number } | null = null;
  for (const mv of chess.moves({ verbose: true })) {
    if (!mv.captured) continue;
    const defended = chess.attackers(mv.to as Square, chess.turn() === 'w' ? 'b' : 'w').length > 0;
    const value = VALUE[mv.captured] - (defended ? VALUE[mv.piece] : 0);
    if (value >= 2 && (!best || value > best.value)) best = { san: mv.san, piece: mv.captured, square: mv.to, value };
  }
  return best;
}

export function coachGame(plies: PlyInput[], review: GameReview, options: CoachOptions): CoachResult {
  const { focus, level, lang } = options;
  const w = W[lang];
  const remarks: Record<number, string> = {};
  const mine = (c: 'white' | 'black') => focus === 'both' || focus === c;
  const tally = { blunder: [] as string[], mistake: [] as string[], dubious: [] as string[], good: [] as string[] };

  plies.forEach((p, i) => {
    const m = review.moves[i];
    const said: string[] = [];
    const at = `${p.moveNumber}`;
    if (mine(p.color)) {
      const q = m.quality;
      const serious = q === 'blunder' || q === 'mistake';
      if (q && (serious || (level >= 2 && q === 'dubious'))) {
        tally[q as 'blunder' | 'mistake' | 'dubious'].push(at);
        said.push(`${w[q as 'blunder' | 'mistake' | 'dubious']}.`);
        // What it allowed: the opponent's answer in the game.
        const reply = plies[i + 1];
        if (reply) {
          if (reply.san.includes('#')) said.push(w.allowsMate(reply.to));
          else if (review.moves[i + 1].motifs.some((x) => x.kind === 'wins-material' || x.kind === 'fork' || x.kind === 'combination')) said.push(w.allowsWin(reply.san));
        }
      }
      // A free piece left on the board.
      const free = freeCapture(p.fenBefore);
      const took = free && p.san.replace(/[+#!?]+$/, '') === free.san.replace(/[+#]+$/, '');
      if (free && !took && m.loss >= 3) said.push(MISSED[lang](localSan(free.san, lang), `${PIECE[lang][free.piece]} ${lang === 'es' ? 'de' : lang === 'en' ? 'on' : 'auf'} ${free.square}`));
      // What the better move did.
      if (q && (serious || (level >= 2 && q === 'dubious')) && m.best) {
        const ideas = moveMotifs(p.fenBefore, m.best.san).filter((x) => !PLAIN.has(x.kind));
        const chess = new Chess(p.fenBefore);
        let after = p.fenBefore;
        try { chess.move(m.best.san); after = chess.fen(); } catch { /* engine line not legal here */ }
        const why = ideas.slice(0, 2).map((x) => motifText(x, after, lang)).filter(Boolean).join(' ');
        said.push(`${w.better} ${localSan(m.best.san, lang)}.${why ? ` ${why}` : ''}`);
      }
      if (level >= 2 && (q === 'good' || q === 'brilliant')) {
        tally.good.push(at);
        said.push(`${w[q]}.`);
      }
      // Level 3: the idea behind every move.
      if (level >= 3 && said.length === 0) {
        const ideas = m.motifs.filter((x) => !PLAIN.has(x.kind)).slice(0, 2).map((x) => motifText(x, p.fenAfter, lang)).filter(Boolean);
        said.push(...ideas);
      }
    } else if (level >= 2) {
      // The opponent: what this move is up to.
      const direct = (k: Motif['kind']) => k === 'threat' || k === 'mate-threat' || k === 'attack-undefended';
      const warn = m.motifs.filter((x) => WARN.has(x.kind)).sort((a, b) => Number(direct(b.kind)) - Number(direct(a.kind))).slice(0, 2).map((x) => ({ x, t: motifText(x, p.fenAfter, lang) })).filter((y) => y.t);
      if (warn.length) {
        const verb = (k: Motif['kind']) => k === 'threat' || k === 'mate-threat' || k === 'attack-undefended';
        said.push(warn.map(({ x, t }, k) => (k === 0 ? (verb(x.kind) ? `${w.watch} ${lowerFirst(t)}` : `${w.idea} — ${t}`) : t)).join(' '));
      }
    }
    if (said.length) remarks[i + 1] = said.join(' ');
  });

  const side = focus === 'both' ? w.both : w[focus];
  const parts: string[] = [];
  const count = (list: string[], k: number) => {
    if (!list.length) return;
    parts.push(`${list.length} ${w.errs[list.length === 1 ? k : k + 1]} (${list.length === 1 ? w.move : w.moves} ${list.join(', ')})`);
  };
  count(tally.blunder, 0);
  count(tally.mistake, 2);
  if (level >= 2) count(tally.dubious, 4);
  if (level >= 2) count(tally.good, 6);
  const intro = `${w.title(side)}: ${parts.length ? parts.join(', ') : w.clean}.`;
  return { remarks, intro };
}

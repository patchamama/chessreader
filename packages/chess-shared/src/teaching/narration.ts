/**
 * Narration script: a recognised game turned into the ordered list of things a
 * narrator says, each with what the board must show while it is said.
 *
 * The script is plain data — text to speak, the node whose position is on the
 * board, and board cues per sentence — so the same script can drive the screen
 * board with a speech synthesiser today and a physical board with lights later.
 */

import { tokenize, DIAGRAM_MARK } from '../notation/sanTokenizer.js';
import { figurineToAscii } from '../notation/figurineToAscii.js';
import { spanishToEnglish } from '../notation/spanishToEnglish.js';
import type { GameNode } from '../model/gameTree.js';
import type { RecognizedGame } from '../recognition/recognizeGames.js';
import { analyseComment, moveCue, type BoardCue } from './commentCues.js';
import { detectLang, type Lang } from './concepts.js';

const WORDS: Record<Lang, Record<string, string>> = {
  es: {
    K: 'rey', Q: 'dama', R: 'torre', B: 'alfil', N: 'caballo', P: 'peón',
    takes: 'por', check: 'jaque', mate: 'jaque mate', short: 'enroque corto', long: 'enroque largo',
    promote: 'y corona', from: 'de', to: 'a', white: 'Blancas', black: 'Negras',
  },
  en: {
    K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn',
    takes: 'takes', check: 'check', mate: 'checkmate', short: 'castles kingside', long: 'castles queenside',
    promote: 'promoting to', from: 'from', to: 'to', white: 'White', black: 'Black',
  },
};

const sayFile = (s: string) => s.replace(/[1-8]/g, '').trim();
const saySquare = (s: string) => `${s[0]} ${s[1]}`;

/** A SAN move as a narrator would say it ("Bxb5+" → "alfil por b 5, jaque"). */
export function sanToSpeech(san: string, lang: Lang): string {
  const w = WORDS[lang];
  const core = san.replace(/[!?]+$/g, '');
  const suffix = core.endsWith('#') ? `, ${w.mate}` : core.endsWith('+') ? `, ${w.check}` : '';
  const body = core.replace(/[+#]+$/, '');
  if (body === 'O-O-O') return w.long + suffix;
  if (body === 'O-O') return w.short + suffix;
  const m = /^([KQRBN])?([a-h]?[1-8]?)(x)?([a-h][1-8])(?:=([QRBN]))?$/.exec(body);
  if (!m) return san;
  const [, piece, hint, capture, dest, promo] = m;
  let out: string;
  if (!piece) {
    // Pawn: "peón a e 4" / "peón e por d 5".
    out = capture
      ? `${w.P} ${sayFile(hint)} ${w.takes} ${saySquare(dest)}`
      : `${w.P} ${w.to} ${saySquare(dest)}`;
    if (lang === 'en' && capture) out = `${sayFile(hint)} ${w.takes} ${saySquare(dest)}`;
  } else {
    const who = hint ? `${w[piece]} ${w.from} ${hint.length === 2 ? saySquare(hint) : hint}` : w[piece];
    out = capture
      ? `${who} ${w.takes} ${saySquare(dest)}`
      : hint ? `${who} ${w.to} ${saySquare(dest)}` : `${who} ${saySquare(dest)}`;
  }
  if (promo) out += ` ${w.promote} ${w[promo]}`;
  return out + suffix;
}

/** Commentary as speech: notation becomes words, numbers and brackets go. */
export function commentToSpeech(text: string, lang: Lang): string {
  const ascii = spanishToEnglish(figurineToAscii(text));
  const tokens = tokenize(ascii).filter((t) => t.type === 'move' || t.type === 'move-number' || t.type === 'result');
  let out = '';
  let cursor = 0;
  let previousWasMove = false;
  for (const t of tokens) {
    const between = text.slice(cursor, t.charStart);
    if (/[^\s]/.test(between.replace(/[(){}[\]]/g, ''))) previousWasMove = false;
    out += between;
    cursor = t.charEnd;
    if (t.type !== 'move') continue;
    const san = t.san!;
    const spoken = /^[a-h][1-8]$/.test(san) && t.isolated ? saySquare(san) : sanToSpeech(san, lang);
    out = previousWasMove ? `${out.replace(/\s+$/, '')}, ${spoken}` : out + spoken;
    previousWasMove = !(/^[a-h][1-8]$/.test(san) && t.isolated);
  }
  out += text.slice(cursor);
  return out
    .replace(new RegExp(`[(){}\\[\\]${DIAGRAM_MARK}]`, 'g'), ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/^[\s,;:.]+/, '')
    .trim();
}

export interface NarrationSentence {
  /** Source text of the sentence. */
  text: string;
  /** What the narrator says. */
  speech: string;
  /** What the board shows while it is said. */
  cues: BoardCue[];
  /** Variation moves the sentence quotes, in order (node ids) — to simulate them. */
  moves: string[];
  charStart: number;
  charEnd: number;
}

export interface NarrationStep {
  kind: 'intro' | 'move' | 'comment';
  /** Node whose position is on the board during the step (null = start position). */
  nodeId: string | null;
  speech: string;
  sentences: NarrationSentence[];
  charStart: number;
  charEnd: number;
}

export interface NarrationOptions {
  /** Where the game's text begins (its title/intro) and ends (default: the game's own span). */
  from?: number;
  to?: number;
  lang?: Lang;
}

/** A sentence ends at . ! ? unless the dot belongs to a move number ("3." / "3..."). */
const SENTENCE_END = /(?<!(?:^|[\s({[])\d{1,3})(?<!\.)[.!?]+["»)}\]]*(?=\s+[A-ZÁÉÍÓÚÑ¡¿{(]|\s*$)/g;

function splitSentences(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  for (const m of text.matchAll(SENTENCE_END)) {
    const end = m.index! + m[0].length;
    out.push({ start, end });
    start = end;
  }
  if (start < text.length) out.push({ start, end: text.length });
  return out.filter((s) => /\S/.test(text.slice(s.start, s.end)));
}

export function buildNarrationScript(
  text: string,
  game: RecognizedGame,
  options: NarrationOptions = {},
): NarrationStep[] {
  const tree = game.tree;
  const from = options.from ?? game.charStart;
  const to = options.to ?? game.charEnd;
  const lang = options.lang ?? detectLang(text.slice(from, to));
  const w = WORDS[lang];

  const main = tree.mainline
    .map((id) => tree.nodes.get(id)!)
    .filter((n) => n.charStart !== undefined && n.charEnd !== undefined);
  const mainIds = new Set(tree.mainline);
  const variationNodes = [...tree.nodes.values()]
    .filter((n) => !mainIds.has(n.id) && n.fen && !n.invalid && n.charStart !== undefined)
    .sort((a, b) => a.charStart! - b.charStart!);

  const steps: NarrationStep[] = [];

  const commentStep = (kind: 'intro' | 'comment', start: number, end: number, node: GameNode | null) => {
    // Drop the move number that introduces the NEXT mainline move.
    const raw = text.slice(start, end).replace(/\d{1,3}\.(?:\.\.)?\s*$/, '');
    const fen = node ? node.fen : tree.startFen;
    const sentences: NarrationSentence[] = [];
    for (const s of splitSentences(raw)) {
      const sentence = raw.slice(s.start, s.end);
      const speech = commentToSpeech(sentence, lang);
      if (!/[A-Za-zÀ-ÿ]{2,}/.test(speech)) continue;
      const charStart = start + s.start;
      const charEnd = start + s.end;
      sentences.push({
        text: sentence.trim(),
        speech,
        cues: analyseComment(sentence, fen, { lastMove: node ? { from: node.from, to: node.to } : null }),
        moves: variationNodes.filter((n) => n.charStart! >= charStart && n.charStart! < charEnd).map((n) => n.id),
        charStart,
        charEnd,
      });
    }
    if (sentences.length === 0) return;
    steps.push({
      kind,
      nodeId: node ? node.id : null,
      speech: sentences.map((s) => s.speech).join(' '),
      sentences,
      charStart: sentences[0].charStart,
      charEnd: sentences[sentences.length - 1].charEnd,
    });
  };

  if (main.length === 0) return steps;
  commentStep('intro', from, main[0].charStart!, null);

  main.forEach((node, i) => {
    const speech = `${node.moveNumber}. ${node.color === 'white' ? w.white : w.black}: ${sanToSpeech(node.san, lang)}`;
    steps.push({
      kind: 'move',
      nodeId: node.id,
      speech,
      sentences: [{
        text: text.slice(node.charStart!, node.charEnd!),
        speech,
        cues: [moveCue({ san: node.san, from: node.from, to: node.to, fen: node.fen })],
        moves: [],
        charStart: node.charStart!,
        charEnd: node.charEnd!,
      }],
      charStart: node.charStart!,
      charEnd: node.charEnd!,
    });
    const next = main[i + 1];
    commentStep('comment', node.charEnd!, next ? next.charStart! : Math.max(to, node.charEnd!), node);
  });

  return steps;
}

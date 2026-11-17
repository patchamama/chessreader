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
import { analyseComment, moveCue, qualityFromAnnotation, type BoardCue, type MoveQuality } from './commentCues.js';
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
  de: {
    K: 'König', Q: 'Dame', R: 'Turm', B: 'Läufer', N: 'Springer', P: 'Bauer',
    takes: 'schlägt', check: 'Schach', mate: 'Schachmatt', short: 'kurze Rochade', long: 'lange Rochade',
    promote: 'und wandelt um in', from: 'von', to: 'nach', white: 'Weiß', black: 'Schwarz',
  },
};

// A lone "b" is read "be grande" by Spanish voices: files are spoken by the
// name of the letter, never as a bare character.
const LETTER_ES: Record<string, string> = { a: 'a', b: 'be', c: 'ce', d: 'de', e: 'e', f: 'efe', g: 'ge', h: 'hache' };
const sayLetter = (ch: string, lang: Lang) => (lang === 'es' ? LETTER_ES[ch] ?? ch : ch);
const sayFile = (s: string, lang: Lang) => sayLetter(s.replace(/[1-8]/g, '').trim(), lang);
const saySquare = (s: string, lang: Lang) => `${sayLetter(s[0], lang)} ${s[1]}`;
const sayHint = (h: string, lang: Lang) => (h.length === 2 ? saySquare(h, lang) : /[a-h]/.test(h) ? sayLetter(h, lang) : h);

/** A SAN move as a narrator would say it ("Bxb5+" → "alfil por be 5, jaque"). */
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
    out = capture
      ? `${w.P} ${sayFile(hint, lang)} ${w.takes} ${saySquare(dest, lang)}`
      : `${w.P} ${w.to} ${saySquare(dest, lang)}`;
    if (lang === 'en' && capture) out = `${sayFile(hint, lang)} ${w.takes} ${saySquare(dest, lang)}`;
  } else {
    const who = hint ? `${w[piece]} ${w.from} ${sayHint(hint, lang)}` : w[piece];
    out = capture
      ? `${who} ${w.takes} ${saySquare(dest, lang)}`
      : hint ? `${who} ${w.to} ${saySquare(dest, lang)}` : `${who} ${saySquare(dest, lang)}`;
  }
  if (promo) out += ` ${w.promote} ${w[promo]}`;
  return out + suffix;
}

const MONTHS: Record<Lang, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
};
/** "2020.11.28" (PGN, "??" allowed) or "28.11.2020". */
const DATE = /(?<![\d.])(\d{4})\.(\d{1,2}|\?\?)\.(\d{1,2}|\?\?)(?!\d)|(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/g;

function sayDate(m: RegExpMatchArray, lang: Lang): string {
  const year = m[1] ?? m[6];
  const month = Number(m[2] ?? m[5]);
  const day = Number(m[3] ?? m[4]);
  const name = month >= 1 && month <= 12 ? MONTHS[lang][month - 1] : null;
  if (!name) return year;
  if (!(day >= 1 && day <= 31)) return lang === 'es' ? `${name} de ${year}` : `${name} ${year}`;
  return lang === 'es' ? `${day} de ${name} de ${year}` : lang === 'de' ? `${day}. ${name} ${year}` : `${name} ${day}, ${year}`;
}

const tidy = (s: string) =>
  s
    .replace(new RegExp(`[(){}\\[\\]${DIAGRAM_MARK}]`, 'g'), ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/^[\s,;:.]+/, '')
    .trim();

export interface SpeechPart {
  /** What is said. */
  speech: string;
  /** Offset in the text of the quoted move that opens this part (null: plain words). */
  at: number | null;
  /** true when it follows the previous move directly (said as a list: "…, …"). */
  glue: boolean;
}

/** Commentary cut at every quoted move, so each move can be shown as it is said. */
export function commentToSpeechParts(text: string, lang: Lang): SpeechPart[] {
  const mask = (src: string) => src.replace(DATE, (d) => ' '.repeat(d.length));
  const ascii = spanishToEnglish(figurineToAscii(mask(text)));
  const tokens = tokenize(ascii).filter((t) => t.type === 'move' || t.type === 'move-number' || t.type === 'result');
  const words = (from: number, to: number) => text.slice(from, to).replace(DATE, (...a) => sayDate(a as unknown as RegExpMatchArray, lang));
  const parts: SpeechPart[] = [{ speech: '', at: null, glue: false }];
  let cursor = 0;
  let previousWasMove = false;
  for (const t of tokens) {
    const between = text.slice(cursor, t.charStart);
    if (/[^\s]/.test(between.replace(/[(){}[\]]/g, ''))) previousWasMove = false;
    parts[parts.length - 1].speech += words(cursor, t.charStart);
    cursor = t.charEnd;
    if (t.type !== 'move') continue;
    const san = t.san!;
    const square = /^[a-h][1-8]$/.test(san) && t.isolated;
    if (square) {
      parts[parts.length - 1].speech += saySquare(san, lang);
    } else {
      parts.push({ speech: sanToSpeech(san, lang), at: t.charStart, glue: previousWasMove });
    }
    previousWasMove = !square;
  }
  parts[parts.length - 1].speech += words(cursor, text.length);
  return parts.map((p) => ({ ...p, speech: tidy(p.speech) })).filter((p) => p.speech !== '');
}

const joinParts = (parts: SpeechPart[]) =>
  tidy(parts.reduce((acc, p) => (acc === '' ? p.speech : p.glue ? `${acc.replace(/[\s,]+$/, '')}, ${p.speech}` : `${acc} ${p.speech}`), ''));

/** Commentary as speech: notation becomes words, numbers and brackets go. */
export function commentToSpeech(text: string, lang: Lang): string {
  return joinParts(commentToSpeechParts(text, lang));
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
  /** The sentence cut at each quoted move: say a part, show its move. */
  parts: Array<{ speech: string; moveId?: string }>;
  charStart: number;
  charEnd: number;
}

export interface NarrationStep {
  kind: 'intro' | 'move' | 'comment';
  /** Node whose position is on the board during the step (null = start position). */
  nodeId: string | null;
  speech: string;
  /** What to show as text while it is said (a move as written: "12. Cxb5"). */
  caption: string;
  /** For a move: who plays it, its number and how good the text says it is. */
  side?: 'white' | 'black';
  moveNumber?: number;
  quality?: MoveQuality;
  sentences: NarrationSentence[];
  charStart: number;
  charEnd: number;
}

export interface NarrationOptions {
  /** Where the game's text begins (its title/intro) and ends (default: the game's own span). */
  from?: number;
  to?: number;
  lang?: Lang;
  /** Say "Blancas:" / "Negras:" before every move (default: no). */
  sayColor?: boolean;
  /** Say the move number on White's moves only (default), on both, or never.
   *  A number said on a Black move always carries the colour. */
  sayNumber?: 'white' | 'both' | 'none';
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
      const spoken = commentToSpeechParts(sentence, lang);
      const speech = commentToSpeech(sentence, lang);
      if (!/[A-Za-zÀ-ÿ]{2,}/.test(speech)) continue;
      const charStart = start + s.start;
      const charEnd = start + s.end;
      sentences.push({
        text: sentence.trim(),
        speech,
        cues: analyseComment(sentence, fen, { lastMove: node ? { from: node.from, to: node.to } : null }),
        moves: variationNodes.filter((n) => n.charStart! >= charStart && n.charStart! < charEnd).map((n) => n.id),
        parts: spoken.map((p) => {
          const node = p.at === null ? undefined : variationNodes.find((n) => n.charStart === charStart + p.at!);
          return node ? { speech: p.speech, moveId: node.id } : { speech: p.speech };
        }),
        charStart,
        charEnd,
      });
    }
    if (sentences.length === 0) return;
    steps.push({
      kind,
      nodeId: node ? node.id : null,
      speech: sentences.map((s) => s.speech).join(' '),
      caption: sentences.map((s) => s.text).join(' '),
      sentences,
      charStart: sentences[0].charStart,
      charEnd: sentences[sentences.length - 1].charEnd,
    });
  };

  if (main.length === 0) return steps;
  commentStep('intro', from, main[0].charStart!, null);

  main.forEach((node, i) => {
    const white = node.color === 'white';
    const sayNumber = options.sayNumber ?? 'white';
    const number = sayNumber === 'both' || (sayNumber === 'white' && white);
    const colour = options.sayColor || (number && !white);
    const speech = `${number ? `${node.moveNumber}. ` : ''}${colour ? `${white ? w.white : w.black}: ` : ''}${sanToSpeech(node.san, lang)}`;
    const written = text.slice(node.charStart!, node.charEnd!);
    const quality = qualityFromAnnotation(
      (/[a-h1-8O#+QRBN]\s?((?:\?\?|!!|\?!|!\?|\?|!)|\$[1-6]\b)/.exec(text.slice(node.charStart!, node.charEnd! + 4)) ?? [])[1] ?? '',
    );
    steps.push({
      kind: 'move',
      nodeId: node.id,
      speech,
      caption: `${node.moveNumber}${white ? '.' : '...'} ${written}`,
      side: node.color,
      moveNumber: node.moveNumber,
      ...(quality ? { quality } : {}),
      sentences: [{
        text: written,
        speech,
        cues: [moveCue({ san: node.san, from: node.from, to: node.to, fen: node.fen, quality })],
        moves: [],
        parts: [{ speech }],
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

const INTROS: Record<Lang, string[]> = {
  es: ['Analicemos la siguiente variante.', 'Hay una variante interesante que se podría analizar.', 'Veamos qué pasaría en esta variante.'],
  en: ["Let's analyse the following variation.", 'There is an interesting variation worth a look.', "Let's see what would happen in this line."],
  de: ['Sehen wir uns die folgende Variante an.', 'Es gibt eine interessante Variante, die sich anzusehen lohnt.', 'Schauen wir, was in dieser Variante passieren würde.'],
};
/** Said before a variation is played on the board (the wording varies with `n`). */
export const variationIntro = (lang: Lang, n: number) => INTROS[lang][n % INTROS[lang].length];
/** Said after it: which game move the board goes back to (`move` already in words). */
export function backToGame(lang: Lang, color: 'white' | 'black', move: string): string {
  return lang === 'es' ? `Volvamos a la partida: la última jugada de las ${color === 'white' ? 'blancas' : 'negras'} fue ${move}.`
    : lang === 'en' ? `Back to the game: ${color === 'white' ? "White's" : "Black's"} last move was ${move}.`
    : `Zurück zur Partie: der letzte Zug von ${color === 'white' ? 'Weiß' : 'Schwarz'} war ${move}.`;
}
/** Seconds of silence after "back to the game", before the board goes back. */
export const RETURN_PAUSE = 2;

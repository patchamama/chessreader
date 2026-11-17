/**
 * Narration track: a narration rendered to ONE audio file plus the list of
 * what happens at each moment of it.
 *
 * The track is the hand-off format for any player — this app, another reader,
 * a physical board with lights: every event says when it starts and ends in
 * the audio, what is said, which position must be on the board (as a FEN, so a
 * board can check its pieces after a seek), the move to make and who makes it,
 * whether to stop and wait for it, the squares and arrows to light and, for a
 * quoted variation, where to come back to.
 */

import type { GameTree } from '../model/gameTree.js';
import type { BoardCue, MoveQuality } from './commentCues.js';
import { moveCue } from './commentCues.js';
import { detectLang, type Lang } from './concepts.js';
import type { NarrationStep } from './narration.js';
import { backToGame, RETURN_PAUSE, sanToSpeech, variationIntro } from './narration.js';

export const TRACK_FORMAT = 'chessreader.narration-track/v1';

export interface NarrationSegment {
  /** 'move': a move of the game · 'variation': a quoted move, shown and taken back · 'comment': words only. */
  kind: 'move' | 'variation' | 'comment' | 'pause';
  /** What is said (sent to the voice). */
  speech: string;
  /** What to show as text. */
  text: string;
  /** Node shown on the board while it is said (null = start position). */
  nodeId: string | null;
  /** Position on the board while it is said. */
  fen: string;
  /** For a move: the position it is played from. */
  fenBefore?: string;
  side?: 'white' | 'black';
  moveNumber?: number;
  san?: string;
  from?: string;
  to?: string;
  quality?: MoveQuality;
  /** A game move: an interactive player stops here until the move is made. */
  pause?: boolean;
  /** A variation move: the node of the game to put back afterwards. */
  returnTo?: string | null;
  cues: BoardCue[];
  /** Index of the narration step it comes from. */
  step: number;
}

/** The script as a flat list of things said, one per audio segment. */
export function narrationSegments(script: NarrationStep[], tree: GameTree, lang?: Lang): NarrationSegment[] {
  let intros = 0;
  const fenOf = (id: string | null) => (id ? tree.nodes.get(id)?.fen ?? tree.startFen : tree.startFen);
  const out: NarrationSegment[] = [];
  script.forEach((step, index) => {
    if (step.kind === 'move') {
      const node = tree.nodes.get(step.nodeId!)!;
      out.push({
        kind: 'move', speech: step.speech, text: step.caption, nodeId: node.id, fen: node.fen, fenBefore: fenOf(node.parentId),
        side: node.color, moveNumber: node.moveNumber, san: node.san, from: node.from, to: node.to,
        ...(step.quality ? { quality: step.quality } : {}),
        pause: true, cues: step.sentences[0].cues, step: index,
      });
      return;
    }
    for (const sentence of step.sentences) {
      const quoted = sentence.parts.some((p) => p.moveId);
      if (!quoted) {
        out.push({ kind: 'comment', speech: sentence.speech, text: sentence.text, nodeId: step.nodeId, fen: fenOf(step.nodeId), cues: sentence.cues, step: index });
        continue;
      }
      // A line off the game is announced first, and closed by naming the last
      // game move, followed by a silence before the board goes back (S19).
      const offGame = sentence.parts.some((p) => p.moveId && !tree.mainline.includes(p.moveId));
      const say = lang ?? detectLang(sentence.text);
      if (offGame) out.push({ kind: 'comment', speech: variationIntro(say, intros++), text: sentence.text, nodeId: step.nodeId, fen: fenOf(step.nodeId), cues: [], step: index });
      let lastFen = fenOf(step.nodeId);
      for (const part of sentence.parts) {
        const v = part.moveId ? tree.nodes.get(part.moveId) : undefined;
        if (v) lastFen = v.fen;
        if (!v) {
          out.push({ kind: 'comment', speech: part.speech, text: sentence.text, nodeId: step.nodeId, fen: fenOf(step.nodeId), cues: sentence.cues, step: index });
        } else {
          out.push({
            kind: 'variation', speech: part.speech, text: sentence.text, nodeId: v.id, fen: v.fen, fenBefore: fenOf(v.parentId),
            side: v.color, moveNumber: v.moveNumber, san: v.san, from: v.from, to: v.to, returnTo: step.nodeId,
            cues: [moveCue({ san: v.san, from: v.from, to: v.to, fen: v.fen })], step: index,
          });
        }
      }
      const last = step.nodeId ? tree.nodes.get(step.nodeId) : undefined;
      if (offGame && last) {
        out.push({ kind: 'comment', speech: backToGame(say, last.color, sanToSpeech(last.san, say)), text: sentence.text, nodeId: step.nodeId, fen: lastFen, cues: [], step: index });
        out.push({ kind: 'pause', speech: `[pause ${RETURN_PAUSE}]`, text: '', nodeId: step.nodeId, fen: lastFen, cues: [], step: index });
      }
    }
  });
  return out;
}

export interface TrackEvent extends NarrationSegment {
  /** Start and end in the audio, in seconds. */
  t0: number;
  t1: number;
}

export interface NarrationTrack {
  format: typeof TRACK_FORMAT;
  lang: Lang;
  title: string;
  white?: string | null;
  black?: string | null;
  voice?: string;
  audio: { file: string; duration: number };
  startFen: string;
  events: TrackEvent[];
}

export interface TrackMeta {
  lang: Lang;
  title: string;
  white?: string | null;
  black?: string | null;
  voice?: string;
  /** File name or URL of the audio. */
  audio: string;
  /** Silence between segments, in seconds. */
  gap: number;
  startFen: string;
}

const ms = (s: number) => Math.round(s * 1000) / 1000;

/** Segments + the measured duration of each one's audio = the timed track. */
export function buildNarrationTrack(segments: NarrationSegment[], durations: number[], meta: TrackMeta): NarrationTrack {
  let t = 0;
  const events: TrackEvent[] = segments.map((segment, i) => {
    const t0 = t;
    const t1 = t0 + (durations[i] ?? 0);
    t = t1 + (i < segments.length - 1 ? meta.gap : 0);
    return { ...segment, t0: ms(t0), t1: ms(t1) };
  });
  return {
    format: TRACK_FORMAT, lang: meta.lang, title: meta.title,
    ...(meta.white !== undefined ? { white: meta.white } : {}),
    ...(meta.black !== undefined ? { black: meta.black } : {}),
    ...(meta.voice ? { voice: meta.voice } : {}),
    audio: { file: meta.audio, duration: ms(t) },
    startFen: meta.startFen,
    events,
  };
}

/** Index of the event being said at `time` (in a gap: the one just said). */
export function eventAt(track: NarrationTrack, time: number): number {
  let lo = 0;
  let hi = track.events.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (track.events[mid].t0 <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * stockfishWorker.ts
 *
 * Creates a Web Worker that loads Stockfish 16 from CDN (no npm package needed).
 * Supports two request types:
 *
 *   { type: 'evaluate', fen, depth? }
 *     → { type: 'eval', fen, scoreCp?, mate?, bestMove?, depth }
 *
 *   { type: 'lines', fen, depth?, count? }   (multipv — up to 5 lines)
 *     → { type: 'lines', fen, lines: Array<{ pv: string[], scoreCp?, mate?, depth }> }
 */

// Stockfish 16 NNUE lite — served from lichess CDN, no CORS issues
const SF_CDN = 'https://lichess1.org/assets/vendor/stockfish/stockfish.js'

export function createStockfishWorker(): Worker {
  const workerCode = `
importScripts('${SF_CDN}');

let sf = null;
let engineReady = false;
let currentFen = null;
let currentDepth = 15;
let currentMode = 'evaluate'; // 'evaluate' | 'lines'
let currentCount = 5;
const pvMap = new Map(); // multipvIndex -> line data

function onMessage(line) {
  if (line === 'uciok') { sf.postMessage('isready'); return; }
  if (line === 'readyok') {
    engineReady = true;
    if (currentFen) sendEval();
    return;
  }

  if (line.startsWith('bestmove')) {
    if (currentMode === 'lines' && pvMap.size > 0) {
      const lines = Array.from(pvMap.values()).sort((a,b) => a.idx - b.idx);
      self.postMessage({ type: 'lines', fen: currentFen, lines });
      pvMap.clear();
    }
    return;
  }

  if (!line.startsWith('info') || !line.includes('score')) return;
  const depthM  = line.match(/\\bdepth\\s+(\\d+)/);
  const cpM     = line.match(/\\bscore cp\\s+(-?\\d+)/);
  const mateM   = line.match(/\\bscore mate\\s+(-?\\d+)/);
  const pvM     = line.match(/\\bpv\\s+(.+)/);
  const mpvM    = line.match(/\\bmultipv\\s+(\\d+)/);
  if (!depthM) return;

  const depth = parseInt(depthM[1]);
  const pv    = pvM ? pvM[1].trim().split(' ') : [];
  const idx   = mpvM ? parseInt(mpvM[1]) : 1;

  if (currentMode === 'evaluate') {
    const bestMove = pv[0];
    if (mateM) {
      self.postMessage({ type: 'eval', fen: currentFen, mate: parseInt(mateM[1]), bestMove, depth });
    } else if (cpM) {
      self.postMessage({ type: 'eval', fen: currentFen, scoreCp: parseInt(cpM[1]), bestMove, depth });
    }
  } else {
    // lines mode — collect final depth only
    if (depth < currentDepth - 2) return;
    const entry = { idx, pv, depth };
    if (mateM)  entry.mate = parseInt(mateM[1]);
    if (cpM)    entry.scoreCp = parseInt(cpM[1]);
    pvMap.set(idx, entry);
  }
}

Stockfish().then(engine => {
  sf = engine;
  sf.addMessageListener(onMessage);
  sf.postMessage('uci');
});

function sendEval() {
  sf.postMessage('stop');
  sf.postMessage('setoption name MultiPV value ' + (currentMode === 'lines' ? currentCount : 1));
  sf.postMessage('ucinewgame');
  sf.postMessage('position fen ' + currentFen);
  sf.postMessage('go depth ' + currentDepth);
}

self.onmessage = (e) => {
  const { type, fen, depth, count } = e.data;
  if (type === 'evaluate' || type === 'lines') {
    currentFen   = fen;
    currentDepth = depth || 15;
    currentMode  = type;
    currentCount = count || 5;
    pvMap.clear();
    if (engineReady) sendEval();
  }
};
`
  const blob = new Blob([workerCode], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)
  URL.revokeObjectURL(url)
  return worker
}

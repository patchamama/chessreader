import { describe, it, expect } from 'vitest';
import { recognizeGames } from '../../recognition/recognizeGames.js';
import { mainlineNodes } from '../../model/gameTree.js';

describe('recognizeGames', () => {
  it('returns empty array for text with no chess moves', () => {
    expect(recognizeGames('This is a book about chess history.')).toEqual([]);
  });

  it('recognises a simple game', () => {
    const games = recognizeGames('1. e4 e5 2. Nf3 Nc6');
    expect(games).toHaveLength(1);
    const nodes = mainlineNodes(games[0].tree);
    expect(nodes.map(n => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('returns charStart and charEnd for the recognised game', () => {
    const text = 'Opening: 1. e4 e5 2. Nf3.';
    const games = recognizeGames(text);
    expect(games).toHaveLength(1);
    // charStart should point to "1."
    expect(games[0].charStart).toBeGreaterThanOrEqual(0);
    expect(games[0].charEnd).toBeGreaterThan(games[0].charStart);
  });

  it('recognises Spanish notation (C->N normalised)', () => {
    const games = recognizeGames('1. e4 e5 2. Cf3 Cc6');
    expect(games).toHaveLength(1);
    const nodes = mainlineNodes(games[0].tree);
    // Spanish Cf3/Cc6 should be normalised to Nf3/Nc6
    expect(nodes.map(n => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('handles a chapter snippet with prose and moves', () => {
    const text =
      'The opening is critical. 1. e4 e5 2. Nf3 Nc6 3. Bc4 gives white the Italian. ' +
      'Play continues with 3... Bc5.';
    const games = recognizeGames(text);
    expect(games.length).toBeGreaterThan(0);
    const nodes = mainlineNodes(games[0].tree);
    expect(nodes.some(n => n.san === 'Bc4')).toBe(true);
  });
});

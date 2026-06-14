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

  it('recognises a game written with Unicode chess figurines', () => {
    const text =
      '1. e4 e5 2. ♘f3 ♘c6 3. ♗c4 ♗c5 4. b4 ♗xb4 5. c3 ♗a5 6. d4 exd4 ' +
      '7. O-O d3 8. ♕b3 ♕f6 9. e5 ♕g6 10. ♖e1 ♘ge7 11. ♗a3 b5 12. ♕xb5 ♖b8 ' +
      '13. ♕a4 ♗b6 14. ♘bd2 ♗b7 15. ♘e4 ♕f5 16. ♗xd3 ♕h5 17. ♘f6+ gxf6 ' +
      '18. exf6 ♖g8 19. ♖ad1 ♕xf3 20. ♖xe7+ ♘xe7 21. ♕xd7+ ♔xd7 ' +
      '22. ♗f5+ ♔e8 23. ♗d7+ ♔f8 24. ♗xe7# 1-0';
    const games = recognizeGames(text);
    expect(games).toHaveLength(1);
    const sans = mainlineNodes(games[0].tree).map(n => n.san);
    expect(sans).toContain('Nf3');
    expect(sans).toContain('Bc4');
    expect(sans).toContain('Rad1');
    expect(sans).toContain('Qxf3');
  });

  it('parses parenthesised figurine variations', () => {
    // A legal game where move 3 has an alternative bishop development as a variation.
    const text = '1. e4 e5 2. ♘f3 ♘c6 3. ♗b5 (3. ♗c4 ♗c5) a6';
    const games = recognizeGames(text);
    expect(games).toHaveLength(1);
    expect(games[0].tree.variations.size).toBeGreaterThan(0);
    // The variation should contain the alternative bishop move (normalised to Bc4).
    const variationSans = [...games[0].tree.variations.values()]
      .flat()
      .flat()
      .map((id) => games[0].tree.nodes.get(id)!.san);
    expect(variationSans).toContain('Bc4');
  });

  it('keeps the original book token in rawSan (source notation)', () => {
    const games = recognizeGames('1. e4 e5 2. ♘f3 ♞c6');
    expect(games).toHaveLength(1);
    const nodes = mainlineNodes(games[0].tree);
    const nf3 = nodes.find(n => n.san === 'Nf3');
    const nc6 = nodes.find(n => n.san === 'Nc6');
    expect(nf3?.rawSan).toBe('♘f3');
    expect(nc6?.rawSan).toBe('♞c6');
  });

  it('keeps Spanish source notation in rawSan', () => {
    const games = recognizeGames('1. e4 e5 2. Cf3 Cc6');
    const nodes = mainlineNodes(games[0].tree);
    expect(nodes.find(n => n.san === 'Nf3')?.rawSan).toBe('Cf3');
  });
});

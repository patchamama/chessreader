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

  describe('reproducibility rule (isolated prose moves)', () => {
    it('excludes bare prose moves (—d5—, casilla e4) from the sequence', () => {
      const text =
        '1. d4 Nf6 (los hipermodernos desdeñaban PD —d5— contra PD —d4—, ' +
        'PR —e5— contra PR —e4—); 2. c4 e6 3. Nc3 Bb4. Controla la casilla e4.';
      const games = recognizeGames(text);
      expect(games).toHaveLength(1);
      const sans = mainlineNodes(games[0].tree).map(n => n.san);
      // Real game moves only — no d5/e5 leaking into the line.
      expect(sans).toEqual(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']);
      // The bare prose tokens land in isolatedMoves instead.
      const iso = games[0].tree.isolatedMoves;
      expect(iso.map(m => m.square)).toEqual(
        expect.arrayContaining(['d5', 'd4', 'e5', 'e4']),
      );
      expect(iso.every(m => m.piece === 'p')).toBe(true);
    });

    it('keeps numbered/chained moves reproducible, even inside parentheses', () => {
      // Mid-game numbers + a paren that opens adjacent to the chain: all real.
      const text = '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) a6';
      const games = recognizeGames(text);
      expect(games).toHaveLength(1);
      // a6 after ')' continues the mainline, not isolated.
      const sans = mainlineNodes(games[0].tree).map(n => n.san);
      expect(sans).toContain('a6');
      expect(games[0].tree.isolatedMoves).toHaveLength(0);
    });

    it('derives the target square and piece for an isolated piece move', () => {
      const games = recognizeGames(
        '1. e4 e5 2. Nf3 y un caballo en Nb5 incomoda al rey.',
      );
      const iso = games.flatMap(g => g.tree.isolatedMoves);
      const nb5 = iso.find(m => m.square === 'b5');
      expect(nb5?.piece).toBe('n');
    });
  });

  describe('opening theory: backtracked move-number anchors a variation', () => {
    it('anchors "3. Nf3" as a variation of move 3, not as move 4 (no result token)', () => {
      // Nimzo-Indian prose: the mainline goes 3. Nc3 Bb4, then the author writes
      // "Si las blancas jugaban 3. Nf3, él replicaba 3... b6". The repeated "3."
      // means Nf3 is an ALTERNATIVE to Nc3, anchored at the position after 2... e6 —
      // NOT a continuation that would become move 4. There is no result token here.
      const text =
        '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4. Las negras controlan e4. ' +
        'Si las blancas jugaban 3. Nf3, él replicaba 3... b6.';
      const games = recognizeGames(text);
      expect(games).toHaveLength(1);
      const tree = games[0].tree;

      // Mainline stays clean: Nf3/b6 must NOT leak in as moves 4/4.
      const sans = mainlineNodes(tree).map(n => n.san);
      expect(sans).toEqual(['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']);

      // Nf3 lives in a variation, and b6 continues that same variation.
      const variationSans = [...tree.variations.values()]
        .flat()
        .flat()
        .map(id => tree.nodes.get(id)!.san);
      expect(variationSans).toContain('Nf3');
      expect(variationSans).toContain('b6');

      // The Nf3 variation forks from the node after 2... e6 (i.e. the Nc3 parent),
      // so both 3.Nc3 (mainline) and 3.Nf3 (variation) share the same parent.
      const nc3 = [...tree.nodes.values()].find(n => n.san === 'Nc3')!;
      const nf3 = [...tree.nodes.values()].find(n => n.san === 'Nf3')!;
      expect(nf3.parentId).toBe(nc3.parentId);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { tokenize } from '../../notation/sanTokenizer.js';

describe('tokenize', () => {
  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('tokenizes a simple mainline', () => {
    const tokens = tokenize('1. e4 e5 2. Nf3 Nc6');
    const moveTokens = tokens.filter(t => t.type === 'move');
    expect(moveTokens).toHaveLength(4);
    expect(moveTokens.map(t => t.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('produces correct character offsets', () => {
    const text = '1. e4 e5';
    const tokens = tokenize(text);
    const e4 = tokens.find(t => t.san === 'e4');
    const e5 = tokens.find(t => t.san === 'e5');

    expect(e4).toBeDefined();
    expect(e5).toBeDefined();
    expect(text.slice(e4!.charStart, e4!.charEnd)).toBe('e4');
    expect(text.slice(e5!.charStart, e5!.charEnd)).toBe('e5');
  });

  it('assigns colors to moves', () => {
    const tokens = tokenize('1. e4 e5 2. Nf3 Nc6');
    const moves = tokens.filter(t => t.type === 'move');
    expect(moves[0].color).toBe('white');
    expect(moves[1].color).toBe('black');
    expect(moves[2].color).toBe('white');
    expect(moves[3].color).toBe('black');
  });

  it('assigns move numbers to moves', () => {
    const tokens = tokenize('1. e4 e5 2. Nf3 Nc6');
    const moves = tokens.filter(t => t.type === 'move');
    expect(moves[0].moveNumber).toBe(1);
    expect(moves[1].moveNumber).toBe(1);
    expect(moves[2].moveNumber).toBe(2);
    expect(moves[3].moveNumber).toBe(2);
  });

  it('handles move numbers with ellipsis (black continuation)', () => {
    const tokens = tokenize('2... Nc6');
    const numToken = tokens.find(t => t.type === 'move-number');
    expect(numToken?.isEllipsis).toBe(true);
    expect(numToken?.color).toBe('black');
  });

  it('handles variation parentheses', () => {
    const tokens = tokenize('1. e4 e5 2. Nf3 (2. d4) 2... Nc6');
    const opens = tokens.filter(t => t.type === 'variation-open');
    const closes = tokens.filter(t => t.type === 'variation-close');
    expect(opens).toHaveLength(1);
    expect(closes).toHaveLength(1);
  });

  it('handles checks and annotations', () => {
    const tokens = tokenize('1. e4 e5 2. Qh5+ Nc6 3. Bc4 Nf6 4. Qxf7#');
    const moves = tokens.filter(t => t.type === 'move');
    expect(moves.some(t => t.san === 'Qh5+')).toBe(true);
    expect(moves.some(t => t.san === 'Qxf7#')).toBe(true);
  });

  it('tokenizes castling', () => {
    const tokens = tokenize('4. O-O O-O-O');
    const moves = tokens.filter(t => t.type === 'move');
    expect(moves.map(t => t.san)).toContain('O-O');
    expect(moves.map(t => t.san)).toContain('O-O-O');
  });

  it('handles mixed prose with moves', () => {
    const text = 'After 1. e4 white controls the center.';
    const tokens = tokenize(text);
    const moves = tokens.filter(t => t.type === 'move');
    expect(moves.some(t => t.san === 'e4')).toBe(true);
    // verify offset points into original text
    const e4 = moves.find(t => t.san === 'e4')!;
    expect(text.slice(e4.charStart, e4.charEnd)).toBe('e4');
  });

  it('returns result tokens', () => {
    const tokens = tokenize('1. e4 e5 1-0');
    const result = tokens.find(t => t.type === 'result');
    expect(result?.raw).toBe('1-0');
  });
});

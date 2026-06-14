import { describe, it, expect } from 'vitest';
import { figurineToAscii } from '../../notation/figurineToAscii.js';

describe('figurineToAscii', () => {
  it('maps white piece glyphs to ASCII letters', () => {
    expect(figurineToAscii('♔g1')).toBe('Kg1');
    expect(figurineToAscii('♕d1')).toBe('Qd1');
    expect(figurineToAscii('♖a1')).toBe('Ra1');
    expect(figurineToAscii('♗c4')).toBe('Bc4');
    expect(figurineToAscii('♘f3')).toBe('Nf3');
  });

  it('maps black piece glyphs to the same ASCII letters (SAN is color-agnostic)', () => {
    expect(figurineToAscii('♚g8')).toBe('Kg8');
    expect(figurineToAscii('♛d8')).toBe('Qd8');
    expect(figurineToAscii('♜a8')).toBe('Ra8');
    expect(figurineToAscii('♝c5')).toBe('Bc5');
    expect(figurineToAscii('♞f6')).toBe('Nf6');
  });

  it('preserves move decorations and captures', () => {
    expect(figurineToAscii('♕xf3')).toBe('Qxf3');
    expect(figurineToAscii('♖ad1!!')).toBe('Rad1!!');
    expect(figurineToAscii('♘f6+')).toBe('Nf6+');
    expect(figurineToAscii('♗xe7#')).toBe('Bxe7#');
  });

  it('replaces pawn glyphs with a single space to preserve offsets', () => {
    expect(figurineToAscii('♙e4')).toBe(' e4');
    expect(figurineToAscii('♟e5')).toBe(' e5');
  });

  it('leaves non-glyph text untouched', () => {
    expect(figurineToAscii('1. e4 e5 2. Nf3 Nc6')).toBe('1. e4 e5 2. Nf3 Nc6');
    expect(figurineToAscii('Después de la apertura')).toBe('Después de la apertura');
  });

  it('is length-preserving for piece glyphs (keeps char offsets aligned)', () => {
    expect(figurineToAscii('♘f3').length).toBe('Nf3'.length);
    expect(figurineToAscii('♕xf3').length).toBe('Qxf3'.length);
    expect(figurineToAscii('19. ♖ad1!! ♕xf3').length).toBe('19. Rad1!! Qxf3'.length);
  });
});

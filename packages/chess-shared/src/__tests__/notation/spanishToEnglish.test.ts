import { describe, it, expect } from 'vitest';
import { spanishTokenToEnglish, spanishToEnglish } from '../../notation/spanishToEnglish.js';

describe('spanishTokenToEnglish', () => {
  it.each([
    // Piece mappings
    ['Cf3', 'Nf3'],
    ['Cc6', 'Nc6'],
    ['Ae2', 'Be2'],
    ['Axf7', 'Bxf7'],
    ['Dd5', 'Qd5'],
    ['Dxd5', 'Qxd5'],
    ['Tf1', 'Rf1'],
    ['Txe5', 'Rxe5'],
    ['Re1', 'Ke1'],  // Rey = King
    // Castling normalisation
    ['0-0', 'O-O'],
    ['0-0-0', 'O-O-O'],
    ['O-O', 'O-O'],
    ['O-O-O', 'O-O-O'],
    // Pawn moves unchanged
    ['e4', 'e4'],
    ['exd5', 'exd5'],
    ['e8=Q', 'e8=Q'],
    // Checks/mates preserved
    ['Nf3+', 'Nf3+'],
    ['Qxd5#', 'Qxd5#'],
  ])('converts %s -> %s', (input, expected) => {
    expect(spanishTokenToEnglish(input)).toBe(expected);
  });

  it('T->R does not clobber King (R->K processed after T->R)', () => {
    // If T (Rook) is processed first, Torre->R, then R->K only catches the ORIGINAL R
    // No T should be in King moves, but T->R must not accidentally become K
    expect(spanishTokenToEnglish('Tf1')).toBe('Rf1');  // Rook f1
    expect(spanishTokenToEnglish('Re1')).toBe('Ke1');  // King e1
  });

  it('disambiguating R: only uppercase R at start is King', () => {
    // Rxe5 in Spanish = Rook capture = English Rxe5 (wait, T=Rook, R=King)
    // So Spanish Rxe5 means King takes e5
    expect(spanishTokenToEnglish('Rxe5')).toBe('Kxe5');
  });
});

describe('spanishToEnglish (full text)', () => {
  it('converts Spanish notation in a full PGN string', () => {
    const input = '1. e4 e5 2. Cf3 Cc6 3. Ac4 Ac5';
    const result = spanishToEnglish(input);
    expect(result).toBe('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5');
  });

  it('handles 0-0 castling normalisation', () => {
    expect(spanishToEnglish('4. 0-0')).toBe('4. O-O');
    expect(spanishToEnglish('4. 0-0-0')).toBe('4. O-O-O');
  });

  it('preserves pawn moves and ranks unchanged', () => {
    const input = '1. d4 d5 2. c4';
    expect(spanishToEnglish(input)).toBe('1. d4 d5 2. c4');
  });

  it('converts ellipsis variants', () => {
    expect(spanishToEnglish('2… Nc6')).toBe('2… Nc6'); // kept: same length as the source
    expect(spanishToEnglish('2&#8230; Nc6')).toBe('2... Nc6');
  });

  it('Torre (T) -> Rook (R) without clobbering King', () => {
    // In a string: T = Torre (Rook), R = Rey (King)
    const input = '1. e4 e5 10. Tf1 Re1';
    const result = spanishToEnglish(input);
    expect(result).toContain('Rf1');
    expect(result).toContain('Ke1');
  });

  it('Dama (D) -> Queen (Q)', () => {
    expect(spanishToEnglish('5. Dd5 Dxd5')).toContain('Qd5');
  });

  it('does NOT convert Re1 to Ke1 in English notation (regression)', () => {
    // English text uses K/N/Q — Re1 means Rook e1, must not become Ke1
    const english = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 10. Re1 Nge7'
    const result = spanishToEnglish(english)
    expect(result).toContain('Re1')
    expect(result).not.toContain('Ke1')
  });

  it('does NOT convert O-O to mangled form in English notation', () => {
    const english = '7. O-O d3 8. Qb3 Qf6'
    expect(spanishToEnglish(english)).toBe('7. O-O d3 8. Qb3 Qf6')
  });

  it('Spanish prose words do not trigger Spanish detection (regression)', () => {
    // "Después" (D+e) and "Cada" (C+a) must NOT count as Spanish piece moves;
    // English moves like Re1/Rxa1 must survive intact
    const text = 'Después de la apertura: 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 y cada bando lucha.'
    const result = spanishToEnglish(text)
    expect(result).toContain('Re1')
    expect(result).toContain('Rb8')
    expect(result).toContain('Después')
    expect(result).not.toContain('Ke1')
  });

  it('Spanish prose words are not converted even in Spanish notation text', () => {
    // In genuine Spanish notation, prose like "Cada" must not become "Nada"
    const text = 'Cada jugada: 1. e4 e5 2. Cf3 Cc6 3. Ac4 también Torre.'
    const result = spanishToEnglish(text)
    expect(result).toContain('Cada')
    expect(result).toContain('también')
    expect(result).toContain('Nf3')
    expect(result).toContain('Bc4')
  });
});

describe('promotion in Spanish notation', () => {
  it('translates the promoted piece letter', () => {
    expect(spanishToEnglish('5. bxa8=D Dc7 6. e8=T h1=C 7. g8=A')).toBe('5. bxa8=Q Qc7 6. e8=R h1=N 7. g8=B')
  })
})

describe('language of the notation is decided by majority', () => {
  it('one foreign-looking token in a comment does not turn English rooks into kings', () => {
    const text = '13. O-O O-O 14. Nc3 Rb8 15. Nh5 f5 16. Qe2 Rf8 { Anticipe un Ce4. } 21. Rad1 Ne7'
    expect(spanishToEnglish(text)).toBe(text)
  })
})

describe('piece letters glued to the move number (books print "3.Cc3", "3...Ab4")', () => {
  it('are translated like spaced ones', async () => {
    const { spanishToEnglish } = await import('../../notation/spanishToEnglish.js')
    expect(spanishToEnglish('1.d4 Cf6 2.c4 e6 3.Cc3 Ab4 4.e3 0-0 5.Ad3 d5 6.Cf3 c5 7.0-0 Cc6 8.a3 Axc3'))
      .toBe('1.d4 Nf6 2.c4 e6 3.Nc3 Bb4 4.e3 O-O 5.Bd3 d5 6.Nf3 c5 7.O-O Nc6 8.a3 Bxc3')
    expect(spanishToEnglish('12...Dxd5 13.Tf1')).toBe('12...Qxd5 13.Rf1')
  })
  it('a whole book game is recognised to the end', async () => {
    const { recognizeGames } = await import('../../recognition/recognizeGames.js')
    const [g] = recognizeGames('Partida 11\nKeres-Averbach\n1.d4 Cf6 2.c4 e6 3.Cc3 Ab4 4.e3 0-0 5.Ad3 d5 6.Cf3 c5 7.0-0 Cc6 8.a3 Axc3\nUna inesperada decisión.', { algorithm: 2 })
    expect(g.tree.mainline.length).toBe(16)
    expect(g.tree.errors).toEqual([])
  })
})

describe('German piece letters (S, L, T, D, K)', () => {
  it('are translated when the text is written with them', async () => {
    const { spanishToEnglish } = await import('../../notation/spanishToEnglish.js')
    expect(spanishToEnglish('1.e4 e5 2.Sf3 Sc6 3.Lb5 a6 4.La4 Sf6 5.0-0 Le7 6.Te1 b5 7.Lb3 d6 8.c3 0-0 9.h3 Dd7 10.Kh2'))
      .toBe('1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 d6 8.c3 O-O 9.h3 Qd7 10.Kh2')
  })
  it('a German game is recognised', async () => {
    const { recognizeGames } = await import('../../recognition/recognizeGames.js')
    const [g] = recognizeGames('Partie 1\n1.e4 e5 2.Sf3 Sc6 3.Lb5 a6 4.La4 Sf6 5.0-0 Le7 6.Te1 b5 7.Lb3 d6\nDer Läufer zieht sich zurück.', { algorithm: 2 })
    expect(g.tree.mainline.length).toBe(14)
    expect(g.tree.errors).toEqual([])
  })
  it('English text with a stray S word stays English', async () => {
    const { spanishToEnglish } = await import('../../notation/spanishToEnglish.js')
    expect(spanishToEnglish('1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6')).toBe('1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6')
  })
})

describe('the "…" ellipsis keeps its length (reader offsets stay aligned)', () => {
  it('converts the move after it and leaves "…" in place', () => {
    expect(spanishToEnglish('7…Ae6 8 Cf3')).toBe('7…Be6 8 Nf3')
  })
})

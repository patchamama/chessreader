/**
 * Squares annotators talk about in each opening (S10), counted by
 * scripts/learn-opening-squares.mjs over 1,250 annotated games (Lichess studies
 * of annotated books, the Bronstein Zurich 1953 book, Kasparov I–II) — counts
 * only, no text. A square is kept when at least 4 games of that opening (and 5%
 * of them) discuss it in the remarks of the first 15 moves. Keyed by the English
 * opening family name of openingName().
 */
export const OPENING_SQUARES: Record<string, string[]> = {
  "French Defence": ["d4", "e5"], // 124 games
  "Sicilian Defence": ["d5", "d4", "c4", "f3"], // 113 games
  "Indian Defence": ["c5", "d5", "e4", "e5"], // 84 games
  "King's Indian Defence": ["f5", "c5", "b5", "b4"], // 72 games
  "Italian Game": ["d4", "f7", "f6", "e5"], // 65 games
  "English Opening": ["c5", "d5", "d4", "e5"], // 60 games
  "Nimzo-Indian Defence": ["e4", "d5", "c5", "e5"], // 57 games
  "Queen's Pawn Game": ["e5", "c4"], // 37 games
  "Caro-Kann Defence": ["d4", "e5", "e6", "e4"], // 34 games
  "King's Gambit Accepted": ["d6", "d4", "d5", "h4"], // 32 games
  "Scandinavian Defence": ["d4", "c6", "e4", "e5"], // 31 games
  "Vienna Game": ["e4"], // 26 games
  "Dutch Defence": ["e4", "e5"], // 19 games
  "Petrov Defence": ["f6"], // 19 games
  "King's Pawn Game": ["e5", "e4", "g4", "d4"], // 17 games
  "Queen's Indian Defence": ["e4", "d5", "c5"], // 14 games
  "London System": ["c7", "c5"], // 9 games
  "Nimzowitsch-Larsen Attack": ["e5"], // 8 games
};

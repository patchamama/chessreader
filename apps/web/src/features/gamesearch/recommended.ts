import type { Opening } from './sources'
import { OPENINGS } from './sources'

/**
 * Recommendations that need no search: short annotated games every learner
 * should know (mates, traps, classics), openings by level, and where to look
 * for studies about a player or a book.
 */
export type Level = 'beginner' | 'intermediate' | 'advanced'

export interface RecommendedGame {
  id: string
  title: string
  category: 'mates' | 'traps' | 'classics'
  level: Level
  /** What it teaches, in one line. */
  lesson: string
  /** Half-moves of the game, and whether it ends in mate (checked by the tests). */
  plies: number
  mate: boolean
  pgn: string
}

const pgn = (white: string, black: string, event: string, moves: string) =>
  `[Event "${event}"]\n[White "${white}"]\n[Black "${black}"]\n\n${moves}`

export const RECOMMENDED_GAMES: RecommendedGame[] = [
  {
    id: 'fools-mate', title: "Fool's Mate", category: 'mates', level: 'beginner', plies: 4, mate: true,
    lesson: 'The fastest mate: never open the diagonal to your own king.',
    pgn: pgn('White', 'Black', "Fool's Mate", '1. f3 { Weakens the diagonal e1-h4. } 1... e5 2. g4 { Opens it completely. } 2... Qh4# { The queen mates on the diagonal: nothing can block or capture. }'),
  },
  {
    id: 'scholars-mate', title: "Scholar's Mate", category: 'mates', level: 'beginner', plies: 7, mate: true,
    lesson: 'Queen and bishop attack f7 together — and how one careless move loses.',
    pgn: pgn('White', 'Black', "Scholar's Mate", '1. e4 e5 2. Bc4 { The bishop aims at f7. } 2... Nc6 3. Qh5 { The queen attacks f7 too, and the pawn on e5. } 3... Nf6 { A blunder: it attacks the queen but leaves f7 undefended. } (3... g6 4. Qf3 Nf6 { defends everything }) 4. Qxf7# { The queen on f7 is protected by the bishop on c4. }'),
  },
  {
    id: 'legals-mate', title: "Légal's Mate", category: 'mates', level: 'beginner', plies: 13, mate: true,
    lesson: 'A pinned knight moves anyway: three minor pieces give mate.',
    pgn: pgn('Légal de Kermeur', 'Saint Brie', 'Paris 1750', '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 { Pins the knight on f3 against the queen on d1. } 4. Nc3 g6 { A wasted move. } 5. Nxe5 { The pinned knight moves and gives up the queen. } 5... Bxd1 (5... dxe5 6. Qxg4 { only loses a pawn }) 6. Bxf7+ Ke7 7. Nd5# { The bishop on f7 checks, the knights on d5 and e5 cover every escape square. }'),
  },
  {
    id: 'blackburne-shilling', title: 'Blackburne Shilling Trap', category: 'traps', level: 'beginner', plies: 14, mate: true,
    lesson: 'Do not grab the pawn on e5: a smothered mate follows.',
    pgn: pgn('White', 'Black', 'Blackburne Shilling Trap', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 { The bait. } 4. Nxe5 { Greedy. } (4. Nxd4 exd4 { is simple and good }) 4... Qg5 { A double attack on the knight on e5 and the pawn on g2. } 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# { A smothered mate: the king is hemmed in by its own pieces. }'),
  },
  {
    id: 'elephant-trap', title: 'Elephant Trap', category: 'traps', level: 'intermediate', plies: 18, mate: false,
    lesson: "Queen's Gambit Declined: the pinned knight is not really pinned.",
    pgn: pgn('White', 'Black', 'Elephant Trap', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7 5. cxd5 exd5 6. Nxd5 { White believes the knight on f6 is pinned. } 6... Nxd5 { It moves anyway. } 7. Bxd8 Bb4+ { The point: the queen must block. } 8. Qd2 Bxd2+ 9. Kxd2 Kxd8 { Black has won a piece. }'),
  },
  {
    id: 'noahs-ark', title: "Noah's Ark Trap", category: 'traps', level: 'intermediate', plies: 22, mate: false,
    lesson: 'Ruy Lopez: the white bishop is trapped by a chain of pawns.',
    pgn: pgn('White', 'Black', "Noah's Ark Trap", '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 d6 5. d4 b5 6. Bb3 Nxd4 7. Nxd4 exd4 8. Qxd4 { The mistake. } (8. Bd5 { keeps the bishop safe }) 8... c5 9. Qd5 Be6 10. Qc6+ Bd7 11. Qd5 c4 { The bishop on b3 has no square: it is lost. }'),
  },
  {
    id: 'fried-liver', title: 'Fried Liver Attack', category: 'traps', level: 'intermediate', plies: 15, mate: false,
    lesson: 'Two Knights Defence: a knight sacrifice on f7 drags the king out.',
    pgn: pgn('White', 'Black', 'Fried Liver Attack', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 { Attacks f7 a second time. } 4... d5 5. exd5 Nxd5 { Natural, but risky. } (5... Na5 { is the main line }) 6. Nxf7 { The sacrifice. } 6... Kxf7 7. Qf3+ Ke6 { The king must defend the knight on d5. } 8. Nc3 { The knight on d5 is pinned and attacked three times. }'),
  },
  {
    id: 'opera', title: 'The Opera Game — Morphy, 1858', category: 'classics', level: 'beginner', plies: 33, mate: true,
    lesson: 'Development before everything: every white piece takes part in the attack.',
    pgn: pgn('Paul Morphy', 'Duke of Brunswick and Count Isouard', 'Paris 1858', '1. e4 e5 2. Nf3 d6 3. d4 Bg4 { A premature pin on the knight on f3. } 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 { Threatening mate on f7. } 6... Nf6 7. Qb3 { A double attack on b7 and f7. } 7... Qe7 8. Nc3 { Development before material. } 8... c6 9. Bg5 b5 10. Nxb5 { The sacrifice. } 10... cxb5 11. Bxb5+ Nbd7 12. O-O-O { The knight on d7 is pinned by the bishop on b5. } 12... Rd8 13. Rxd7 { An exchange sacrifice. } 13... Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ { The queen sacrifice. } 16... Nxb8 17. Rd8#'),
  },
  {
    id: 'immortal', title: 'The Immortal Game — Anderssen, 1851', category: 'classics', level: 'intermediate', plies: 45, mate: true,
    lesson: 'Both rooks and the queen are sacrificed for a mate with three minor pieces.',
    pgn: pgn('Adolf Anderssen', 'Lionel Kieseritzky', 'London 1851', "1. e4 e5 2. f4 exf4 { The King's Gambit accepted. } 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 { Gives up the bishop on b5. } 11... cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 { Offers both rooks. } 18... Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ { The queen sacrifice. } 22... Nxf6 23. Be7#"),
  },
  {
    id: 'evergreen', title: 'The Evergreen Game — Anderssen, 1852', category: 'classics', level: 'advanced', plies: 47, mate: true,
    lesson: 'A quiet rook move prepares a queen sacrifice and a mating net of bishops.',
    pgn: pgn('Adolf Anderssen', 'Jean Dufresne', 'Berlin 1852', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 { The Evans Gambit. } 4... Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 { The quiet move that prepares everything. } 19... Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ { The queen sacrifice. } 21... Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7#'),
  },
]

/** Openings to start with at each level (the master games of each are one click away). */
export const OPENINGS_BY_LEVEL: Record<Level, string[]> = {
  beginner: ['italian', 'queens-gambit', 'french'],
  intermediate: ['ruy-lopez', 'sicilian', 'caro-kann', 'kings-gambit', 'english'],
  advanced: ['najdorf', 'nimzo-indian', 'kings-indian', 'grunfeld'],
}
export const openingsFor = (level: Level): Opening[] =>
  OPENINGS_BY_LEVEL[level].map((id) => OPENINGS.find((o) => o.id === id)!).filter(Boolean)

/** Players and books to look for among Lichess studies (Lichess has no API for this search). */
export const STUDY_TOPICS: { group: 'Players' | 'Books'; label: string; query: string }[] = [
  { group: 'Players', label: 'Capablanca', query: 'Capablanca' },
  { group: 'Players', label: 'Alekhine', query: 'Alekhine' },
  { group: 'Players', label: 'Lasker', query: 'Lasker' },
  { group: 'Players', label: 'Fischer', query: 'Fischer' },
  { group: 'Players', label: 'Kasparov', query: 'Kasparov' },
  { group: 'Players', label: 'Morphy', query: 'Morphy' },
  { group: 'Players', label: 'Tal', query: 'Mikhail Tal' },
  { group: 'Books', label: 'My Great Predecessors (Kasparov)', query: 'My Great Predecessors' },
  { group: 'Books', label: 'My System (Nimzowitsch)', query: 'My System Nimzowitsch' },
  { group: 'Books', label: 'Chess Fundamentals (Capablanca)', query: 'Chess Fundamentals Capablanca' },
  { group: 'Books', label: 'Tratado General de Ajedrez (Grau)', query: 'Grau Tratado' },
  { group: 'Books', label: 'Zurich 1953 (Bronstein)', query: 'Zurich 1953' },
]
export const lichessStudySearchUrl = (query: string) => `https://lichess.org/study/search?q=${encodeURIComponent(query)}`

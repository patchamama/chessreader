/** The most common openings, as suggestions to replay in Find by position (S4). */
export interface CommonOpening { name: string; eco: string; pgn: string }

export const COMMON_OPENINGS: CommonOpening[] = [
  { name: 'Ruy Lopez', eco: 'C60', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5' },
  { name: 'Italian Game', eco: 'C50', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5' },
  { name: 'Scotch Game', eco: 'C45', pgn: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4' },
  { name: 'Petrov Defence', eco: 'C42', pgn: '1. e4 e5 2. Nf3 Nf6 3. Nxe5 d6 4. Nf3 Nxe4' },
  { name: 'Sicilian Defence (Najdorf)', eco: 'B90', pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6' },
  { name: 'French Defence', eco: 'C00', pgn: '1. e4 e6 2. d4 d5 3. Nc3 Nf6' },
  { name: 'Caro-Kann Defence', eco: 'B10', pgn: '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4' },
  { name: 'Scandinavian Defence', eco: 'B01', pgn: '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5' },
  { name: "Queen's Gambit Declined", eco: 'D30', pgn: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5' },
  { name: "Queen's Gambit Accepted", eco: 'D20', pgn: '1. d4 d5 2. c4 dxc4 3. Nf3 Nf6' },
  { name: 'Slav Defence', eco: 'D10', pgn: '1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3' },
  { name: "King's Indian Defence", eco: 'E60', pgn: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6' },
  { name: 'Nimzo-Indian Defence', eco: 'E20', pgn: '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4' },
  { name: 'Grünfeld Defence', eco: 'D80', pgn: '1. d4 Nf6 2. c4 g6 3. Nc3 d5' },
  { name: 'English Opening', eco: 'A20', pgn: '1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6' },
  { name: 'London System', eco: 'D02', pgn: '1. d4 d5 2. Nf3 Nf6 3. Bf4 e6 4. e3' },
  { name: 'Catalan Opening', eco: 'E00', pgn: '1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2' },
  { name: "King's Gambit", eco: 'C30', pgn: '1. e4 e5 2. f4 exf4 3. Nf3' },
  { name: 'Pirc Defence', eco: 'B07', pgn: '1. e4 d6 2. d4 Nf6 3. Nc3 g6' },
  { name: 'Dutch Defence', eco: 'A80', pgn: '1. d4 f5 2. g3 Nf6 3. Bg2' },
]

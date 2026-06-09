# Golden Fixtures for Chess Move Recognition

These fixtures are shared between PHP (apps/api) and TypeScript (packages/chess-shared) test suites.
Both suites load the same JSON and assert their produced GameTree matches the expected output.

## FEN Comparison Note

FEN strings from chess.js vs p-chess/chess differ in the en-passant square field (field 4):
- chess.js: always uses `-` even when an EP square exists
- p-chess/chess: uses the actual EP square (e.g. `e3`) per FIDE spec

For golden comparison, we compare only the first 3 FEN fields (piece placement + active color + castling rights),
ignoring the EP field. This is captured in `fenPrefix` which contains fields 1-3 only.

## Fixtures

- `simple-mainline.json` — 1. e4 e5 2. Nf3 Nc6
- `spanish-notation.json` — same game in Spanish notation (Cf3, Cc6)
- `with-variation.json` — mainline with a variation in parentheses
- `nested-variation.json` — nested variation
- `illegal-move.json` — a game with an illegal move producing an invalid node
- `castling.json` — game with O-O (short castling)

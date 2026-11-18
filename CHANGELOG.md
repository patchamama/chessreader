# Changelog

Every version of ChessReader, newest first: the date of its tag and the commits it brought (from the git history; versions follow `apps/web/src/version.ts`).

## v0.96.0 — 2026-11-18

- feat: Lichess games open in the study too — the game of a puzzle, Lichess tournaments, and the game played in Play

## v0.95.0 — 2026-11-18

- feat: answers in notation (puzzle and problem solutions, traps, Play ideas) with move thumbnails and a replay board; collapsible "About this…" sections that explain patterns, traps and openings in the selected language, with Wikipedia and Lichess links

## v0.94.0 — 2026-11-18

- feat: my games show only the years and months with games, with their counts, and an "All games" list

## v0.93.0 — 2026-11-18

- feat: the demo opens without login; example books can be hidden (✕) and shown again from Settings; the library lists the books of the resources repository; the study board has the braces ⇄ paragraphs switch for the current game

## v0.92.0 — 2026-11-18

- fix: resources repository URL defaults to github.com/patchamama/chessreader-resources and accepts github.com URLs (read through the contents API: fixes "Failed to fetch"); Settings checks the URL and token

## v0.91.0 — 2026-11-18

- feat: errors page in the deployed app reads every book of the private resources repository (GitHub token in Settings) and opens its games in the reader

## v0.90.1 — 2026-11-18

- fix: start.sh updates pnpm older than 9; GitHub token passed by environment, never in argv or .git/config; engines always killed after their move

## v0.90.0 — 2026-11-18

- feat: start scripts install engines, Maia and the private resources; diagram images to FEN; changelog

## v0.89.0 — 2026-11-18

- feat: play against other engines on the server — Stockfish, Maia nets, GNU Chess (v0.89.0)

## v0.88.0 — 2026-11-18

- feat: recognition errors page — books table, games ranked by errors, open in the reader (v0.88.0)

## v0.87.0 — 2026-11-18

- feat: level test with adaptive puzzles that sets the Maia hint level (v0.87.0)

## v0.86.0 — 2026-11-18

- feat: game database of the books — book cards, search, openings, engine ranking of players, statistics (v0.86.0)

## v0.85.0 — 2026-11-18

- feat: trap trainer (classic traps public, book traps private) with spaced repetition and traps in Play (v0.85.0)

## v0.84.0 — 2026-11-18

- feat: tactical pattern trainer from the Lichess puzzle database and pattern names in move hints (v0.84.0)

## v0.83.0 — 2026-11-18

- feat: Play random colour, ideas on my turn (opening, targets, chances) and pattern names (v0.83.0)

## v0.82.0 — 2026-11-18

- feat: accounts in Settings (one Lichess token, chess.com user) and your games by year and month (v0.82.0)

## v0.81.0 — 2026-11-18

- feat: page width setting and a status bar with position, evaluation, mode and time (v0.81.0)

## v0.80.0 — 2026-11-18

- feat: full-screen board with moves, evaluation and narration controls; thumbnails on engine lines under diagrams (v0.80.0)

## v0.79.1 — 2026-11-18

- feat: switch a game's comments between braces and paragraphs; PGN and FEN downloads always available (v0.79.1)

## v0.79.0 — 2026-11-18

- feat: board place survives refresh, hover preview restores, coloured arrows; fix blank regenerate and line highlights (v0.79.0)

## v0.78.0 — 2026-11-18

- feat: games that start from a FEN in the text; recognition choice without the legacy algorithm (v0.78.0)

## v0.77.1 — 2026-11-17

- fix: engine input guards, depth cap and token scope from the security review (v0.77.1)

## v0.77.0 — 2026-11-17

- feat: Maia human-move predictions on the server and in the Play tutor (v0.77.0)

## v0.76.0 — 2026-11-17

- feat: human commentary database by position, borrowed into annotated games (v0.76.0)

## v0.75.1 — 2026-11-17

- fix: unused import broke lint and the demo build (v0.75.1)

## v0.75.0 — 2026-11-17

- fix: read dashed square pairs as plans in prose or long-notation moves (v0.75.0)

## v0.74.0 — 2026-11-17

- feat: engine evaluations under book diagrams, refresh and evaluate-all (v0.74.0)

## v0.73.0 — 2026-11-17

- feat: Stockfish versions on the server and Stockfish 18 in the browser (v0.73.0)

## v0.72.0 — 2026-11-17

- feat: book-like diagrams, move hint evaluation and regenerate comments (v0.72.0)

## v0.71.0 — 2026-11-17

- feat: Play tutor options, move status, Lichess players and clocks, Maia bots (v0.71.0)

## v0.70.0 — 2026-11-17

- feat: Lichess puzzles, cloud eval source and analysis import (v0.70.0)

## v0.69.0 — 2026-11-17

- feat: remarks on moves not played, from the engine (v0.69.0)

## v0.68.1 — 2026-11-17

- fix: promotion written without "=" ("32 b8D!", "fxg8Q+") (v0.68.1)

## v0.68.0 — 2026-11-17

- fix: a bracket the book never closes no longer swallows the game (v0.68.0)

## v0.67.0 — 2026-11-17

- feat: download the annotated game as PDF, EPUB, Markdown or HTML (v0.67.0)

## v0.66.1 — 2026-11-17

- fix(api): illegal move kept off the mainline, as the golden fixture says (v0.66.1)

## v0.66.0 — 2026-11-17

- feat: pause after each move in the narration and the MP3 (v0.66.0)

## v0.65.0 — 2026-11-17

- feat: Lichess AI opponent, chosen clock, my Lichess games, prefilled token (v0.65.0)

## v0.64.0 — 2026-11-17

- feat: annotated games laid out like a book by default; Berlin remarks fixed (v0.64.0)

## v0.63.0 — 2026-11-17

- feat: read books with bare move numbers, "…" and engine lines (v0.63.0)

## v0.62.1 — 2026-11-17

- fix: download master games from explorer.lichess.ovh/masters/pgn (v0.62.1)

## v0.62.0 — 2026-11-17

- fix: commentary audit checks the overload of either side (v0.62.0)

## v0.61.0 — 2026-11-17

- feat: key squares per opening learnt from annotated games; README (v0.61.0)

## v0.60.0 — 2026-11-17

- fix: wording found in the end-to-end run; click-to-move on the play board (v0.60.0)

## v0.59.0 — 2026-11-17

- fix: a second numbered branch inside a prose variation branches from the same point (v0.59.0)

## v0.58.0 — 2026-11-17

- feat: positional sacrifices, ideas of the better move, overloaded defenders of either side; variation intro/return in the audio track (v0.58.0)

## v0.57.0 — 2026-11-17

- fix: German notation, unclosed braces, Lichess-style accuracy, narration backend limits and cleanup (v0.57.0)

## v0.56.0 — 2026-11-17

- feat: play against the engine, a person or Lichess with a live tutor (v0.56.0)

## v0.55.0 — 2026-11-17

- feat: coach review of a played game, commentary audit, Spanish moves glued to their number (v0.55.0)

## v0.54.0 — 2026-11-17

- feat: narration announces and closes variations; autoscroll option (v0.54.0)

## v0.53.0 — 2026-11-17

- feat: annotated games laid out like a book (split lines, paragraphs) with diagrams and their evaluation (v0.53.0)

## v0.52.0 — 2026-11-17

- feat: commentary drops wrong remarks and looks ahead: castling preparation, converging attack, overload, trapped pieces, combinations, mate escapes (v0.52.0)

## v0.51.0 — 2026-11-17

- feat: Lichess personal token for the masters explorer and offline copies of read games (v0.51.0)

## v0.50.0 — 2026-11-16

- feat: Claude as a commentary model through the official SDK (v0.50.0)

## v0.49.0 — 2026-11-16

- feat: commentary patterns learnt from annotated games, board ideas, model commentary, trilingual demos (v0.49.0)

## v0.48.0 — 2026-11-16

- fix: verifier findings in the recogniser and the narration backend; position ideas (v0.48.0)

## v0.47.0 — 2026-11-16

- feat(search): recommended games by category, openings by level, ranking and Lichess links (v0.47.0)

## v0.46.0 — 2026-11-16

- feat: narration as MP3 with a timed cue track, voice providers and trilingual demos (v0.46.0)

## v0.45.0 — 2026-11-16

- feat: correction workbench to edit, check and export a game (v0.45.0)

## v0.44.0 — 2026-11-16

- feat: problem mode at the key positions of a game (v0.44.0)

## v0.43.0 — 2026-11-16

- feat: engine review of each player, key moments, automatic commentary and move hints (v0.43.0)
- test: give the upload form tests a router

## v0.42.0 — 2026-11-16

- feat: paste text or PGN into the reader; fix errors on heavily annotated PGN (v0.42.0)

## v0.41.0 — 2026-11-16

- feat: narration in sync with the board, German, language setting and recogniser fixes (v0.41.0)

## v0.40.0 — 2026-11-16

- feat: search annotated and classic games on Lichess and chess.com (v0.40.0)

## v0.39.0 — 2026-11-16

- feat: narrate a game aloud with the board lighting up what is said (v0.39.0)

## v0.38.0 — 2026-11-16

- fix: restart the board on a new game and set apart fragments after a diagram (v0.38.0)

## v0.37.0 — 2026-11-16

- feat: detect wrong moves and propose the correction the game confirms (v0.37.0)

## v0.36.0 — 2026-11-16

- feat(demo): complete annotated classic games as demo library (v0.36.0)
- fix(ci): resolve lint errors that kept the CI workflow failing

## v0.35.0 — 2026-11-16

- fix: recognise parenthesised variations of real annotated games (v0.35.0)

## v0.34.0 — 2026-11-16

- fix: paint prose moves by source position instead of SAN matching (v0.34.0)

## v0.33.0 — 2026-06-16

- fix: number-authoritative move resolver in the reader + debug panel polish (v0.33.0)

## v0.32.0 — 2026-06-16

- feat: sync viewer with algorithm + richer recognition debug panel (v0.32.0)

## v0.31.1 — 2026-06-16

- fix: treeToPgn infinite recursion (stack overflow) on real variation trees (v0.31.1)

## v0.31.0 — 2026-06-16

- feat: two-pass number-authoritative recognition (algorithm 2) + debug panel (v0.31.0)

## v0.30.0 — 2026-06-15

- feat: bracket/brace variations, move-number contiguity, recognition error panel (v0.30.0)

## v0.29.0 — 2026-06-15

- fix: newline-aware move recognition — paragraph-start moves anchor the mainline (v0.29.0)

## v0.28.0 — 2026-06-15

- feat: per-book custom render config with admin editor (v0.28.0)

## v0.27.0 — 2026-06-15

- feat: Guess the Move practice + Position Trainer spaced repetition (v0.27.0)
- docs: update README for v0.26.0 — regenerable diagrams, notes, theming, test counts

## v0.26.0 — 2026-06-15

- feat: regenerable diagram images with Stockfish eval footer + manual-save notes (v0.26.0)
- refactor: align StudyBoard with showEngineArrow setting

## v0.25.0 — 2026-06-15

- feat: invert engine arrow toggle to 'Show engine move arrow' (on by default) + settings persist merge

## v0.24.0 — 2026-06-15

- feat: drag-resizable study panel; board always fills its width (v0.24.0)

## v0.23.0 — 2026-06-15

- fix: normalize inlined SVG piece size so leipzig (and any set) fills its square
- feat: add 5 lichess piece sets — leipzig, maestro, fantasy, cardinal, staunty (v0.23.0)

## v0.22.0 — 2026-06-15

- feat: full settings panel — app theme, piece sprites, board size, sound, autoplay (v0.22.0)
- chore(infra): idempotent migrations via schema_migrations + 128M upload limits
- feat: isolated prose moves (reproducibility rule) + board-square highlight

## v0.21.0 — 2026-06-15

- feat: Stockfish progressive eval panel + engine/premove arrows (v0.21.0)
- fix: prose opening-theory backtracked move-number anchors as variation

## v0.19.1 — 2026-06-14

- fix: variation chooser appears at the fork node, not the move before it (v0.19.1)

## v0.19.0 — 2026-06-14

- feat: playable study board + fix duplicate turn indicator (v0.19.0)

## v0.18.1 — 2026-06-14

- fix: highlight only the clicked move, not the same move in other games (v0.18.1)

## v0.18.0 — 2026-06-14

- feat: prose variation underline + click-to-choose + numbered highlight (v0.18.0)

## v0.17.0 — 2026-06-14

- feat: delete book + book cover on library card (v0.17.0)

## v0.16.0 — 2026-06-14

- feat: prose analysis variations + active-move sync (v0.16.0)

## v0.15.0 — 2026-06-14

- feat: figurine move recognition + interactive study board (v0.15.0)
- feat: add Notes panel with pending-task badge in header
- feat: serve EPUB images via ZIP endpoint, rewrite relative src in reader
- feat: EPUB layout settings, scoped CSS rendering, Stockfish eval fixed horizontal in study board
- fix: study board panel fixed — h-screen layout so aside never scrolls away
- feat: original HTML always shown, SAN spans clickable, study board with Stockfish eval, chessboard grid icon
- feat: reading progress on BookCard, click notation → study board, inline EPUB images as base64
- feat: reader nav bar, TOC drawer, split study board, last-chapter persistence
- fix: start chapter index at 1 to match EPUB ingestion order
- feat: drag & drop EPUB upload + fix Content-Type for multipart requests
- fix: disable MSW on localhost — demo mode only on GitHub Pages or VITE_DEMO=true

## v0.14.0 — 2026-06-12

- test: align admin and library tests with new mock data
- feat: bump version to 0.14.0
- test: add AdminPage, ActiveUsersTable, BlockedUsersTable, ResetPasswordPage, BookEditModal component tests (RED)
- test: add adminApi, authApi, libraryApi new hook tests (RED)
- test: add AdminController, AuthController, LibraryController functional tests for new endpoints (RED)
- test: add LoggingPasswordResetNotifier tests (RED)
- test: add application handler tests for login_count, ListUsersByStatus, GetUserBooks, SetUserPassword, RequestPasswordReset, ResetPassword, UpdateBook, SetLastReadBook (RED)
- test: add DbalUserRepository, DbalBookRepository, UserMetricsReadModel, DbalPasswordResetRepository tests (RED)
- test: add User domain tests for login_count, lastReadBookId, withPasswordHash (RED)
- test: add migration 003 schema acceptance tests (RED)
- ci: build chess-shared before typecheck so web resolves its dist types

## v0.13.0 — 2026-06-10

- fix: strict SAN detection prevents Spanish prose from mangling English moves
- feat: add Stockfish version selector in settings (SF9/10 cdnjs, SF10/16 jsDelivr)
- fix: exclude invalid nodes from mainline and fix Rook notation detection
- fix: engine lines format and move text hover preview
- fix: do not convert Re1 to Ke1 in English notation
- feat: redesign engine lines display and eval bar sizing
- fix: resolve all lint errors
- fix: load stockfish via fetch+blob to avoid importScripts CORS block
- fix: use base64url encoding for demo JWT payload
- feat: add settings panel, keyboard nav, and fix CI deploy
- feat: fix stockfish eval bar and add engine lines panel
- fix: save session after login and pre-fill demo credentials
- fix: resolve MSW service worker URL from import.meta.env.BASE_URL
- fix: build chess-shared before web in CI
- fix: allow msw build scripts in pnpm via .npmrc

## v0.12.0 — 2026-06-10

- feat: add MSW demo mode and GitHub Pages deploy v0.12.0
- docs: remove emojis from README headings
- docs: add README, install.sh, install.bat, start.bat

## v0.11.0 — 2026-06-09

- feat: add app layout with styled UI and optional localhost login v0.11.0
- chore: add start.sh dev launcher and vite api proxy

## v0.10.0 — 2026-06-09

- feat: add mv3 browser extension

## v0.9.0 — 2026-06-09

- feat: add webparser url viewer

## v0.8.0 — 2026-06-09

- feat: add local diagram regeneration

## v0.7.0 — 2026-06-09

- feat: add stockfish dual evaluation (EPIC-6) v0.7.0

## v0.6.0 — 2026-06-09

- feat: add interactive chess viewer (EPIC-5) v0.6.0

## v0.5.0 — 2026-06-09

- feat: add chess move recognition and game tree

## v0.4.0 — 2026-06-09

- feat: add epub and website ingestion

## v0.3.0 — 2026-06-09

- feat: add processed-books library

## v0.2.0 — 2026-06-09

- feat: add auth and admin approval

## v0.1.0 — 2026-06-09

- feat: add monorepo scaffolding architecture

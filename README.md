# ♞ ChessReader

> **Turn any chess book, EPUB or website into an interactive reading experience.**

ChessReader parses chess content — EPUBs, public URLs, plain text — recognises move notation in Spanish and English, builds a full game tree, and lets you step through every move on a live board with Stockfish evaluation. A companion browser extension brings the same experience to any chess blog you visit.

**[Live Demo →](https://patchamama.github.io/chessreader/)** — no login required, no backend needed. Runs entirely in the browser with mock data.

---

## Features

| Feature | Description |
|---|---|
| **EPUB Library** | Upload and read chess books with inline interactive boards |
| **Web Parser** | Paste any public URL — ChessReader extracts and renders the chess content |
| **Interactive Viewer** | Click any move in the text to jump to that position on the board |
| **Variation Trees** | Full PGN variation support with collapsible branches |
| **Study Board** | Drag-resizable analysis panel; the board always fills its width |
| **Stockfish Eval** | Live engine evaluation bar per move (WASM in-browser + native server-side) + progressive engine/premove arrows. The browser uses Stockfish 18 lite, served by the site itself (CDN builds of 10/16 remain selectable). On the server, Admin → Engine checks the latest Stockfish release on GitHub (once a day), downloads any listed release for the server's platform and chooses the version in use (the system binary until another is chosen) |
| **Regenerable Diagrams** | Toggle any book diagram between the original image and a freshly rendered board, with a small Stockfish footer (`SF18: (1.30) 1. Nf3 …`, score from White's POV). Right-click to pick board theme, piece set and coordinate symbols, or edit the FEN. Under any book diagram (original image or generated board) the engine's evaluation can be written as books print it: who is better and by how much, engine and depth, the engine's line and up to two alternatives with their score, an optional evaluation bar, and a ⟳ button to evaluate that diagram again; the *Diagram evaluations* panel adds them where missing or replaces them all (the server's Stockfish with MultiPV when there is a server — `POST /api/eval/position {fen, depth, lines}` — else the browser engine or the Lichess cloud) |
| **Narration** | The game read aloud (browser voice, or an MP3 + timed cue track rendered by the server: system voices, Piper, OpenAI, ElevenLabs), the board following every move and lighting what is said; variations are announced, played and closed ("back to the game…"); manual mode waits for you to make the move; a pause after each move (0–5 s, Settings) for the live voice and the MP3 |
| **Engine review & coach** | Stockfish review with accuracy per player (Lichess formula), key moments and commentary at three levels (with "the only good move" — the engine's second choice and its refutation — and the engine's plan after a quiet move, saying whether the game carried it out); a *coach review* of a game you played (focus on White, Black or both): errors with what they allowed, free pieces left, the better move and what it did, the opponent's threats; optional commentary by Claude or OpenAI with your own key; *Re-analyse and regenerate all comments* runs the engine again over the whole game and writes every remark and diagram anew; diagrams are drawn with your board colours and piece set, centred, with the evaluation in words, the engine and depth, its next moves and an alternative; hovering a move shows the evaluation before → after, the winning chances it gave away and the engine's move as a dashed arrow; *Analyse on Lichess* imports the game to the Lichess analysis board; engine source *Lichess cloud first* (Settings) uses Lichess' deep cloud analysis when it knows the position and the local Stockfish otherwise |
| **Book layout** | Annotated games written as a book: remarks in braces, a line per remark, or a paragraph after the moves; diagrams at the key moments (or the moves you pick) with the engine evaluation under them |
| **Play with a tutor** | Play the engine (strength 1–8), a person at the same board, someone on Lichess (casual) or the Lichess AI (level 1–8), a Maia bot on Lichess (plays like a person of 1100/1500/1900), at the clock you choose (10+5 by default; token with `board:play` and `challenge:write`); the tutor comments every move: ideas, threats, chances, what your move leaves. Options: the selected piece's moves coloured by quality (with a legend for the first moves), a status after each move (book move from the bundled ECO table or the masters explorer, tablebase result with ≤7 pieces, else best/good/inaccuracy/mistake/blunder by the engine), evaluation bar, moves said aloud (opponent's or both). Lichess games show both players with ratings and titles, the ticking clocks and a Resign button |
| **Game search** | Recommended annotated games (offline), Lichess studies, master games by opening (needs a free Lichess token), tournaments, chess.com archives, your own Lichess games (to review and comment them), Lichess puzzles (the puzzle of the day, or new ones for your rating with a token); games read from Lichess are kept offline |
| **Notes** | Per-user scratch notes with explicit Save and maximize — stored server-side, cached offline |
| **Theming** | App light/dark theme, 6 board color themes, 7 piece sprite sets, board size, move sounds, autoplay |
| **Browser Extension** | MV3 Chrome/Edge extension — makes chess blogs interactive without the app |
| **Auth & Roles** | JWT-based login with user/admin roles and approval flow |
| **Dev Bypass** | On `localhost`, login is optional — direct access to all features |

---

## Architecture

```
chessreader/
├── apps/
│   ├── api/          # PHP 8.5 · Slim 4 · Clean Architecture (Domain / Application / Infrastructure)
│   ├── web/          # React 19 · TypeScript · Vite · Tailwind CSS
│   └── extension/    # MV3 Browser Extension (Chrome / Edge)
└── packages/
    └── chess-shared/ # Shared TypeScript: move recognition, GameTree, PGN parser
```

The frontend and extension share the `chess-shared` package. The API is a standalone Slim 4 app following Hexagonal Architecture — domain logic is framework-agnostic and fully tested.

---

## Tech Stack

### Backend — `apps/api`
![PHP](https://img.shields.io/badge/PHP-8.5-777BB4?logo=php&logoColor=white)
![Slim](https://img.shields.io/badge/Slim-4-74a045?logo=php&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)

| Layer | Technology |
|---|---|
| Framework | [Slim 4](https://www.slimframework.com/) + PHP-DI |
| Database | SQLite via [Doctrine DBAL](https://www.doctrine-project.org/projects/dbal.html) |
| Auth | JWT ([firebase/php-jwt](https://github.com/firebase/php-jwt)) + bcrypt |
| Chess engine | Native [Stockfish](https://stockfishchess.org/) binary (UCI); releases downloaded to `storage/stockfish/<tag>/` from Admin → Engine (`GET /api/admin/engine/stockfish`, `POST …/install {tag}`, `PUT …/selected {tag}`) |
| HTTP client | [Guzzle](https://docs.guzzlephp.org/) |
| Content extraction | Readability algorithm |
| Tests | PHPUnit |

### Frontend — `apps/web`
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)

| Layer | Technology |
|---|---|
| UI | React 19 + [react-chessboard](https://github.com/Clariity/react-chessboard) |
| State | [Zustand](https://zustand-demo.pmnd.rs/) (local) + [TanStack Query](https://tanstack.com/query) (server) |
| Router | React Router v7 |
| Chess logic | [chess.js](https://github.com/jhlywa/chess.js) + chess-shared (monorepo) |
| Engine (browser) | [Stockfish WASM](https://github.com/nmrugg/stockfish.js) via Web Worker |
| Tests | Vitest + React Testing Library |

### Browser Extension — `apps/extension`
- Manifest V3 (Chrome / Edge)
- Pure DOM — no framework dependency
- Reuses `chess-shared` for move recognition and `GameTree`

### Shared — `packages/chess-shared`
- TypeScript: `sanTokenizer`, `recognizeGames`, `pgnToTree`, `GameTree`
- Spanish ↔ English notation normalisation
- 86 unit tests

---

## Quick Start

### Prerequisites

| Tool | Min version | Install |
|---|---|---|
| PHP | 8.1 | [php.net](https://www.php.net/downloads) |
| Composer | 2 | [getcomposer.org](https://getcomposer.org) |
| Node.js | 18 | [nodejs.org](https://nodejs.org) |
| pnpm | 8 | `npm i -g pnpm` |
| Git | any | [git-scm.com](https://git-scm.com) |

### macOS / Linux — one command

```bash
curl -fsSL https://raw.githubusercontent.com/patchamama/chessreader/main/install.sh | bash
```

This clones the repo into `./chessreader`, installs all dependencies, then prints instructions to start.

### Windows — one command

```bat
curl -fsSL https://raw.githubusercontent.com/patchamama/chessreader/main/install.bat -o install.bat && install.bat
```

### Manual install

```bash
# 1. Clone
git clone https://github.com/patchamama/chessreader.git
cd chessreader

# 2. Install dependencies
composer install --working-dir=apps/api
pnpm install

# 3. Start
bash start.sh          # macOS / Linux
start.bat              # Windows
```

### Start

```bash
# macOS / Linux
bash start.sh

# Windows
start.bat
```

The stack starts on:

| Service | URL |
|---|---|
| **Web app** | http://127.0.0.1:5173 |
| **API** | http://127.0.0.1:8080/api/health |

> **Dev mode:** on `localhost` login is optional — you get full admin access automatically. A "dev mode" badge appears in the header.

### Environment overrides

```bash
API_PORT=9000 WEB_PORT=4000 ADMIN_EMAIL=me@example.com ADMIN_PASSWORD=secret bash start.sh
```

---

## Usage

### Library
Upload an EPUB or a book URL → chapters appear in the library. Open a chapter and click any chess move to advance the board.

### Regenerable diagrams
Each diagram in a chapter shows a small toggle in its corner: switch between the **original book image** and a **freshly rendered board** for the same position (inferred from the preceding mainline moves). The generated board carries a one-line Stockfish footer — e.g. `SF18: (1.30) 1. Nf3 …` — with the score always given from White's point of view. **Right-click** the generated board to choose the board color theme, piece set and coordinate symbols, or to **edit the FEN** directly.

### Web Parser
Go to **Webparser**, paste a URL (e.g. a chess blog post) and ChessReader fetches the page, detects all games, and renders them inline with interactive boards. Switch between **Normal** (HTML as-is) and **Substitution** (diagram images replaced by live boards) modes.

### Browser Extension
Load the unpacked extension from `apps/extension/` in Chrome (`chrome://extensions → Load unpacked`). Visit any chess site — the extension detects diagrams and game notation and makes them interactive.

### Commenting a game
Open a game → **Review and comment the game** → choose the commentary level, layout (a line per remark by default, as books print it) and diagrams (key moments, every 20 half-moves and the final position, with the evaluation) → **Open annotated game** or **Download** it (PDF, EPUB, Markdown or HTML, diagrams included), or pick **Focus on** and **Coach review** for a master's view of a game you played (paste it with *Paste text*).

### Play
**Play** in the menu: choose the opponent and the engine strength, click a piece and then its square (or drag it). For Lichess, the link on the page opens the token form with the permissions already ticked (`board:play`, `challenge:write`, `study:read`); one token serves the explorer, your games and playing.

### Measuring the commentary
`packages/chess-shared/scripts/evaluate-commentary.mjs <annotated.pgn>` (or `--book <book.txt>`) measures how many of the ideas human annotators name the detectors find; `audit-commentary.mjs <games.pgn>` checks every remark against the board and the moves that followed; `learn-opening-squares.mjs` counts the squares annotators discuss per opening.

### Admin Panel
Visit `/admin` to approve or reject pending user accounts.

---

## Tests

```bash
# PHP backend (308 tests)
cd apps/api && ./vendor/bin/phpunit

# Frontend (621 tests)
cd apps/web && pnpm test

# Shared chess library (315 tests)
cd packages/chess-shared && pnpm test
```

---

## Roadmap

- [x] Dark mode
- [x] Settings panel (themes, piece sets, board size, sound, autoplay)
- [x] Regenerable diagrams with Stockfish footer
- [ ] PGN export from viewer
- [ ] Multi-language UI (ES / EN)
- [ ] PWA / offline support
- [ ] Docker Compose for production

---

## Maia: how people play

[Maia](https://www.maiachess.com/) nets (trained on human games by rating) predict the move a player of a given level would choose — often the "natural" move a book refutes, not the engine's.

- **Play:** the Maia bots of Lichess (maia1/5/9 ≈ 1100/1500/1900) as opponents; with the server, the option *What a player of my rating would play* shows Maia's three most likely moves on your turn.
- **Server:** `GET /api/engine/human?fen=…&rating=1500&limit=3` answers `{rating, moves: [{uci, probability}]}` using [lc0](https://lczero.org/) and the nets in `apps/api/storage/maia/`:

```bash
brew install lc0   # or your platform's package
mkdir -p apps/api/storage/maia && cd apps/api/storage/maia
for r in 1100 1500 1900; do curl -LO https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-$r.pb.gz; done
```

The Maia code is GPL-3.0 and its nets carry no separate licence notice, so this repository does not ship them; each server downloads them.

## Human commentary database

What book authors (and Lichess study writers) said about a position, borrowed when another game reaches it: the annotated game then shows the remark as a quote with a quiet source line ("— Kasparov, Mis geniales predecesores III, Partida 12"). Books come before studies; the reader's language first.

Build it from your own books (plain text, chapters separated by form feeds) and PGN files with `{comments}`:

```bash
pnpm --filter @chess-ebook/chess-shared build
node packages/chess-shared/scripts/build-comment-db.mjs manifest.json out/
```

`manifest.json` lists the sources: `[{ "file": "kasparov3.txt", "title": "…", "author": "…", "lang": "es", "kind": "book" }, …]`. The output has `comments.sqlite` (schema `apps/api/migrations/005_position_comments.sql`, with a `comment_translations` table for later), `index.json`, `p/<xx>.json` (comments by the first two hex digits of the position hash, FNV-1a 64 of the FEN without move counters) and `g/<id>.json` (the whole game of each comment).

- **With the server:** copy `comments.sqlite` to `apps/api/storage/`; the app asks `GET /api/comments/position?hash=…&fen=…` and `GET /api/comments/games/{id}`.
- **Static (demo):** Settings → *Commentary database*: the base URL of the output. Book texts are third-party works: publish them only in a **private** GitHub repository and give the app its contents API URL (`https://api.github.com/repos/<owner>/<repo>/contents`) and a fine-grained token with *contents: read* (kept in the browser, sent only to GitHub). Never commit the output to this repository.

## License

[MIT](LICENSE) · built with ♞ and a lot of coffee.

Third-party data: `apps/web/public/patterns/` is built by `apps/web/scripts/build-pattern-db.mjs` from the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0): popular puzzles per tactical theme over four rating bands, used by the pattern trainer and to name the pattern of a move. `apps/web/public/openings/eco.json` is built by `apps/web/scripts/build-eco.mjs` from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0-1.0). The cburnett pieces in `apps/web/src/shared/chess/pieces/cburnett/` (used to draw diagrams) are by Colin M.L. Burnett, from lichess-org/lila (GPLv2+).

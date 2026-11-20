# chess-shared scripts

Offline tools that build ChessReader's data. Each script documents its options
in its header comment; this page covers the commentary pipeline.

## Commentary from Lichess: harvest → build → translate

Three steps turn public, human-annotated Lichess games into the commentary
database (`comments.sqlite`, `p/`, `g/`, `comments-index/`) that a resources
repository such as `chessreader-resources-sample` publishes.

```sh
cd packages/chess-shared
pnpm build                                   # build-comment-db.mjs imports ../dist

# 1. Harvest: public studies/broadcasts → filtered PGN + attribution + manifest
cp scripts/lichess-sources.example.json /path/to/work/lichess-sources.json   # edit it
node scripts/harvest-lichess.mjs /path/to/work/lichess-sources.json /path/to/work/harvest

# 2. Build the commentary database from the harvested PGN
node scripts/build-comment-db.mjs /path/to/work/harvest/lichess/manifest.json /path/to/work/db

# 3. Universalise and translate with an OpenAI-compatible model (here a local Ollama)
node scripts/translate-comments.mjs /path/to/work/db/comments.sqlite \
  --base-url http://localhost:11434/v1 --model <model> \
  --universal --langs es,en,de,fr --source-kind lichess --dry-run --limit 3
# check /path/to/work/db/comments.sqlite.review.jsonl, then run again without --dry-run
```

### 1. `harvest-lichess.mjs`

- **Config** (`lichess-sources.example.json`): `studies` (8-character ids),
  `users` (every public study of a user), `broadcasts` (tournament ids); each
  entry is an id or `{ "id", "lang", "title" }`. Thresholds: `minComments`,
  `minCommentChars`, `minPlies`, `maxGames`; `lang` and `delayMs`.
- **Endpoints** (no token, public data only):
  `GET /api/study/{id}.pgn`, `GET /api/study/by/{username}/export.pgn`,
  `GET /api/broadcast/{id}.pgn`, all with `clocks=false&comments=true&variations=true`
  and `Accept: application/x-chess-pgn`.
- **Politeness**: one request at a time, `delayMs` between requests, at least
  60 s wait after HTTP 429 (as the Lichess API asks), backoff on 5xx, the
  `User-Agent` `chessreader-harvest (sample data tool)`.
- **Quality filter** per game: human comments only; `[%clk]`, `[%eval]`,
  arrows and Lichess's engine annotations ("Mistake. Nf1 was best.") are
  removed and not counted. A game is kept with at least `minComments` comments
  of `minCommentChars` characters and `minPlies` main-line half-moves.
- **Output** under `<out>/lichess/`: `<source>.pgn`, `harvest.json` (every kept
  game with study/chapter URL and author, every dropped game with its reason)
  and `manifest.json` (`kind: "lichess"` entries for `build-comment-db.mjs`).

Lichess studies are their authors' work. Keep `harvest.json` with the data,
credit the study URL and author wherever the comments are published, and drop a
source whose author asks for it.

### 2. `build-comment-db.mjs`

Unchanged: reads the manifest and writes the database. PGN comments are read
as prose, so a comment counts only where the recogniser places it on a
position; expect fewer comments than the harvest counted.

### 3. `translate-comments.mjs`

- Reads `position_comments` of a `comments.sqlite`, writes
  `comment_translations (comment_id, lang, text)`.
- `--universal` first rewrites each comment for any game reaching the position
  (no player names, no book, game or tournament references) and stores it as
  the row in the comment's own language; translations are made from it.
- `--langs` targets (`es,en,de,fr`); moves are written with the piece letters
  of the target language.
- Every proposal is checked: not empty, at most 3 times longer, every move of
  the original kept, no move added. A failing proposal is not written.
- Every proposal goes to the review file (`--review`, default
  `<db>.review.jsonl`, appended) with its status and problems.
- Resumable: `(comment, language)` pairs that already have a row are skipped.
- `--delay-ms` between calls (default 1000), retries 429/5xx;
  `--dry-run` writes only the review file; `--limit` counts comments.
- `--base-url`, `--model`, `--key` or `LLM_BASE_URL`, `LLM_MODEL`,
  `LLM_API_KEY`. A local Ollama needs no key.

### Publishing to the sample repository

Copy `comments.sqlite`, `p/`, `g/`, `comments-index/` and `index.json` from the
build output into the resources repository (see its `docs/FORMAT.md`), add the
attribution from `harvest.json`, check with its `scripts/validate.py`, and
review the commit before pushing.

# chess-shared scripts

Offline tools that build ChessReader's data. Each script documents its options
in its header comment; this page covers the commentary pipeline.

## Commentary from Lichess: harvest → build → translate → rebuild

Four steps turn public, human-annotated Lichess games into the commentary
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

# 4. Rebuild: the translations of db/comments.sqlite are kept and written to the static files
node scripts/build-comment-db.mjs /path/to/work/harvest/lichess/manifest.json /path/to/work/db
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

Reads the manifest and writes the database and its static files.

- **PGN sources** (`.pgn`, `kind: "lichess"`) are read straight from the moves
  (`pgnComments.mjs`, chess.js): every human comment of the main line and the
  variations lands on the position after the move it follows, with its `ply`,
  full move number (`move`), `san`, game and source. A comment before the first
  move of the game is on the start position (`ply` 0, `move` 0, `san` ""); one
  before the first move of a variation on the position the variation branches
  from. Comments are cleaned as the harvest cleans them (no `[%clk]`, `[%eval]`,
  `[%cal]`, `[%csl]`, no engine-only notes), shorter than 20 characters are
  skipped, longer than 700 are cut at a sentence end. A game needs 10 main-line
  half-moves; a line stops at an illegal move. `g/<id>.json` holds the game's
  PGN with its comments.
- **Books** (`.txt`) are read with the game recogniser, as before.
- **Translations** (`comment_translations`, written by `translate-comments.mjs`)
  survive a rebuild: the rows of `<out-dir>/comments.sqlite` (or of
  `--translations <comments.sqlite>`) are matched to the rebuilt comments by
  position and original text, stored again, and written to the static files,
  so a deploy without a backend can show the reader's language:

  ```json
  // p/<xx>.json and comments-index/<n>.json, only on comments that have some
  { "id": 12, "text": "The Spanish: …", "lang": "en", "translations": { "es": "La española: …", "de": "…" }, … }
  ```

  `index.json` then also counts them (`"translations": <rows>`).

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

#### v2: the pipeline chosen after measuring local models

```sh
node scripts/translate-comments.mjs <comments.sqlite> --ollama --v2 --universal \
  --model gpt-oss:20b --translate-model translategemma:27b --langs es,en,de \
  --source-kind lichess --concurrency 3 --review <run.review.jsonl>
```

- `--ollama` uses Ollama's own API: each model is preloaded and kept in GPU
  memory (`keep_alive: -1`), thinking is turned off, and a model without JSON
  mode still answers.
- `--v2` stores the moves of a comment as figurines (`♘f3`), a notation that
  needs no translation (the app writes them in the reader's notation), uses
  the v2 prompts, and lets the model drop a comment with no chess content
  left (results, greetings): it gets an empty row in its own language and is
  never borrowed again. The original text always stays in `position_comments.text`;
  the standardised text is the row in the comment's own language.
- `--translate-model` translates with another model than the one that rewrites.
- A rewrite that fails the checks is not translated (the original names players).
- `--concurrency` comments in flight at once.

Measured on 14 comments (8 Lichess, 6 books), Apple GPU, models kept loaded
(seconds per call, share of answers that kept every move):

| Model | Standardise | Translate | Notes |
|---|---|---|---|
| gpt-oss:20b | 3.0 s, 93 % | 2.2 s, 100 % | fast; weak German/Spanish terminology ("clavado", "Schlage") |
| qwen3.6:35b-a3b | 1.4 s, 93 % | 1.8 s, 85 % | fastest, but loses moves |
| qwen3.8:27b | 4.0 s, 100 % | 4.9 s, 100 % | translates "pin" as "clavo" |
| gemma4:31b | 5.3 s, 93 % | 4.8 s, 100 % | good, slower |
| translategemma:27b | – | 5–6.5 s, 100 % | best terminology ("clavada", "Fesselung"); chosen to translate |
| translategemma:12b | – | 4.6 s | rejected: gender and terminology errors |

Standardising uses gpt-oss with the v2 prompt (the v3 prompt with examples
lost moves with it). Throughput is bound by the GPU: about 450 comments an hour.

### Publishing to the sample repository

Copy `comments.sqlite`, `p/`, `g/`, `comments-index/` and `index.json` from the
build output into the resources repository (see its `docs/FORMAT.md`), add the
attribution from `harvest.json`, check with its `scripts/validate.py`, and
review the commit before pushing.

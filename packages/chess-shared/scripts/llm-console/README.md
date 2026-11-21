# LLM tasks console

A local web console (English / Spanish) to run, watch, benchmark and publish the normalization and translation of the commentary database with local LLMs (Ollama) or an external one.

```
./local_llms_tasks.sh [--db path/to/comments.sqlite] [--port 8777] [--lang en|es] [--no-open]
local_llms_tasks.bat  [same options]
```

Needs Node 22.5+ (built-in `node:sqlite`); nothing to install. It listens on 127.0.0.1 only; every request that changes something needs the `X-Console: 1` header.

| Tab | What it does |
| --- | --- |
| Status | What was done and what is running: LLMs, progress per phase and language, speed and time left, the latest results. The result categories link to the Results tab; pending work can be queued. |
| Queue | Start / stop / pause the runner; models (★ = recommended), target languages, concurrency, cool-down pauses, how strict the normalization is about dropping moves, Ollama downloads, an external LLM, and the prompts the LLMs receive. |
| Results | Every attempt of the run (accepted, dropped, rejected, failed) with filters; review a translation in a modal (edit, revoke, delete and queue again); redo one or many with an external AI or another local model. |
| Benchmark | Compare up to 3 LLMs on the same sample (load, prefill, tok/s, pass rate); an external judge rates them and can propose a better prompt. |
| Lichess studies | The studies already in the database (games, comments, authors); **Get studies** shows public studies (by username, URL or id, or "more from the authors of my studies") before you decide which to add. No token is needed; Lichess blocks scraping of its listing pages, so browsing with descriptions is a link to lichess.org. |
| Settings (⚙) | Accounts and keys: GitHub, Lichess, OpenAI, Anthropic and any OpenAI-compatible server. Each has a **Test** button that makes a real call (user and scopes for GitHub and Lichess, the model list for the AI providers), then you choose the model and use it as the external LLM. |
| Publish | Local vs remote statistics, then update the resources repository and the sample repository (only when you confirm). |

Rules the tool keeps
- Translations are always made from the normalized text.
- A normalization may drop the moves of later play: **strict** rejects any dropped move; **moderate** (default) allows it when the comment alludes to later play ("then", "later", "on move 14", a later move number). Translations are always strict.
- Only one process writes the database at a time (the translate script); the console refuses to start another.
- Secrets live in `~/.local-llms-tasks/secrets.json` (mode 0600) or in the usual environment variables, and are never returned or logged. A GitHub token comes from the environment, `gh auth token`, or a field kept in memory.

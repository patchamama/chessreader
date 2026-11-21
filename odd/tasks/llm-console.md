# llm-console
Objective: a local web console (EN/ES) to run, watch, benchmark and publish the comment normalization/translation done by local LLMs. Branch: main (work-unit commits + tag). Delivery: ask-on-risk. Runner: Vitest in packages/chess-shared (`pnpm --filter @chess-ebook/chess-shared test`), tsc/eslint where TS is touched. Lives in `packages/chess-shared/scripts/llm-console/` (zero dependencies, Node 24, `node:sqlite`), launchers `local_llms_tasks.sh` / `.bat` at the repo root.

## Specs
- S1 "por ahora que solo se traduzcan del inglés al español y que no se traduzcan a otro idioma y que se haga la normalización." Done by parent on the live run (`--langs es`).
- S2 "estas categorías ponles enlaces de forma que se puedan mostrar estos datos para ver lo sucedido": Resultados del LLM (acumulado): normalizados, descartados por no ser universales, rechazados por validación, traducidos, traducciones rechazadas, fallos.
- S3 "Pon botones de iniciar traducción en cosas pendientes de forma que pueda agregar a una cola de tareas."
- S4 "También me gustaría ver los prompts usados para las tareas, o el link para verlos."
- S5 "opción también de cambiar el llm que traduce y normaliza poniendo un aster al recomendado."
- S6 "en idiomas objetivo seleccionar el deseado y por el momento solo "es". en concurrencia la cantidad deseada y por el momento 3."
- S7 "Opción ahí también de probar llms diferentes para diferentes tareas y así evaluar, pudiendo elegir hasta 3 llms para la misma tarea y probarlo, con tiempo de prefil, procesamiento de traducción de cada uno,... y datos importantes para el benchmach, más opción de que una IA definida externa potente de openai, anthropic pueda evaluar las traducciones o normalización y dar un beredicto o mejorar los prompts."
- S8 "Pon en la parte superior derecha opción que muestre GPU y porciendo de uso, cantidad de cores, LLms cargados en la GPU."
- S9 "En las traducciones dar también posibilidad de realizar nueva traducción o normalización usando IA externa, así como en los errores o rechazados. También poder seleccionar varios elementos ya sucedidos y asignarles una acción a repetir con ia externa."
- S10 "Agrega opción de local_llms_tasks.sh y .bat que permita iniciar esta tools y pon la tools en inglés y español."
- S11 "También agrega opción de obtener, revisar y agregar nuevos estudios, o partidas comentadas de lichess, mostrando los estudios existentes y la cantidad de partidas con tienen, quién las generó e información valiosa que pueda ser útil."
- S12 "También poner opción de actualizar repo resource externo con toda la información de la base de datos y la base de datos en sí, poniendo lo que se contiene en local con estadísticas y lo que existe en este si se tiene el token desde el acceso en el backend o terminal o si se brinda el token en un menú de opciones,  y lo mismo con el repo de recursos sample pero usando solo los comentarios de lichess o quizás los 100 (elegir número) comentarios más citados o fen más citados eligiendo aleatoriamente hasta 3 en las partidas de libros, poniendo en el comentario que es un sample de las partidas comentadas a modo de muestra o algo así."
- S13 "Claro botón de iniciar, botón de pausar cada cierto tiempo si se desea para refrescar la gpu, opción de descargar más LLM de ollama pero también opción de elegir un llm externo si se desea para las tareas aquí puestas, además de los llms locales."
- S14 (from the earlier request, kept) The status page: what was done and is being done, which LLM, how much is left, the last translation and normalization to review.

## Design
- Server `server.mjs`: 127.0.0.1 only, JSON routes, static `public/`, modules auto-loaded from `modules/<name>/index.mjs` (`export default { routes(app) }`); mutating routes need header `X-Console: 1` and a localhost Host header. Each module owns its UI file `public/<name>.js` that calls `Console.registerTab({ id, title: {en,es}, render })` and `Console.addStrings({ en, es })`.
- Shared libs (parent): `lib/config.mjs` (settings JSON in `$LLM_CONSOLE_HOME` or `~/.local-llms-tasks`, secrets in a separate 0600 file, masked on read), `lib/db.mjs` (node:sqlite), `lib/ollama.mjs` (ps/tags/pull/chat with timings), `lib/llm.mjs` (ollama | openai | anthropic | openai-compatible), `lib/gpu.mjs` (macOS ioreg/system_profiler, nvidia-smi), `lib/http.mjs`.
- Secrets never logged or returned; tokens (GitHub) come from the environment, `gh auth token`, or a field in the UI kept in memory only.
- Anything that writes to a remote repository shows a dry-run (local vs remote statistics) first and needs an explicit button.
- Tests use fakes (no real tokens, no network, temp databases); the real `apps/api/storage` and the live run db are never written by tests.

## Tasks
- [x] T1 S8 S10 S14 skeleton: server, libs, shell UI (tabs, EN/ES, GPU header), status tab, launchers — inline (parent)
- [ ] T2 S3 S5 S6 S13 queue + runner + settings (models with recommended ★, langs, concurrency, pause/cool-down, ollama pull, external LLM) and S4 prompts viewer — delegated
- [ ] T3 S2 S9 results browser (category links, filters, pagination) + selection + redo with external AI — delegated
- [ ] T4 S7 benchmark (up to 3 LLMs, timings) + external judge / prompt improvement — delegated
- [ ] T5 S11 Lichess studies (list, stats, fetch/add) — delegated
- [ ] T6 S12 resources + sample repo sync (stats, dry-run, token, sample selection) — delegated
- [ ] T7 integrate, bilingual check, README, version bump + tag

## Log
- L1 2026-11-21 user (verbatim): "por ahora que solo se traduzcan del inglés al español y que no se traduzcan a otro idioma y que se haga la normalización. Por otro lado, estas categorías ponles enlaces ... [S2–S13 as quoted above]"
- L2 2026-11-21 parent: live run restarted as `w12/run-es.sh` (translate books en→es, translate lichess en→es, then normalization passes) with `--langs es`; the previous `run-all.sh` was stopped.

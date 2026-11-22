# reader-translate-games
Objective: translate the comments of a game in the reader with AI, one by one, and keep them (original + translation) in the commentary database with the game's PGN in several languages. Branch: main (work-unit commits + tag). Delivery: ask-on-risk. Runners: Vitest (apps/web), PHPUnit (apps/api); tsc + eslint last.

## Specs
- S1 "si lo que se muestra está en un idioma diferente al de la interfaz, poner en el símbolo de la ia que debe de aparecer arriba con los demás botones como el de ocultar/mostrar tablero, la opción de traducir y la IA usando un prompt acorde al contexto del juego de ajedrez, debe de traducir cada comentario por separado"
- S2 "agregar los comentarios con sus traducciones originales y la traducción a la base de datos de comentarios, así si en el futuro aparece esta partida, que se muestra automáticamente traducida"
- S3 "debe de haber una tabla de partidas con el pgn en diferentes idiomas y los comentarios de una determinada partida apuntarían al mismo registro que contiene el pgn en diferentes idiomas"
- S4 (carried) after "Comment this game again" in the continuous study view, the frame of game 1 swallows the next game's heading.

## Contract (API)
- table `game_translations(game_id TEXT, lang TEXT, pgn TEXT, PRIMARY KEY (game_id, lang))`, created lazily like comment_translations.
- `GET /api/comments/games/{id}` gains `translations: { [lang]: pgn }`.
- `PUT /api/comments/games/{id}/translations/{lang}` (admin) `{ pgn }` → `{ saved, lang }`; 404 unknown game; 409 read-only.
- `POST /api/comments/book-games` (admin) `{ book: { title, author?, lang }, chapter: int, game: { label?, white?, black?, pgn, comments: [{ hash(16 hex), key, ply, move, san, text }], translations?: { [lang]: { pgn?, comments: string[] (same order) } } } }` → `{ gameId, sourceId, added, translated }`. Source = (kind 'book', title) reused; game id deterministic from title+chapter+pgn; comments not repeated (same hash+text in that game); translations go to comment_translations / game_translations.

## Tasks
- [x] T1 API: store + controller + routes + PHPUnit — delegated (writer, parallel unit)
- [x] T2 Web: language detection, per-comment translation of a game, toolbar Translate button, save to API — parent inline
- [x] T3 S4 frame drift after recomment — fixed in v0.144.0 (untilHeading clamp in gameMarkers.ts, checked in the browser). Cause: Found: the region of game 1 (data-game-region) swallows the next game's H2 + date after a recomment that includes a generated diagram (`diagram-host` span + `p.diagram-eval`); recognition of the rewritten text is correct (game end before the heading, checked in a unit fixture), so the offsets of the live DOM extraction drift where the diagram host is. Not reproduced in jsdom yet.
- [x] T4 stored translation shows by itself (sha1 id, pgnToTranslatedText, loadCommentGame translations) — parent

## Log
- L1 2026-11-22 user: "continua con lo pendiente y revisa por qué al abrirse el pgn o los pgns de un lichess, no funciona al punsar en el modo corchetes ... También si lo que se muestra está en un idioma diferente al de la interfaz, poner en el símbolo de la ia que debe de aparecer arriba con los demás botones como el de ocultar/mostrar tablero, la opción de traducir y la IA usando un prompt acorde al contexto del juego de ajedrez, debe de traducir cada comentario por separado, y agregar los comentarios con sus traducciones originales y la traducción a la base de datos de comentarios, así si en el futuro aparece esta partida, que se muestra automáticamente traducida y eso se logra si se sabe sin errores extrayendo de la base de datos de comentarios esta partida a partir del libro, capítulo,... y la partida completa debe de guardarse traducida en la base de datos pero viendo esto, creo que debe de haber una tabla de partidas con el pgn en diferentes idiomas y los comentarios de una determinada partida apuntarían al mismo registro que contiene el pgn en diferentes idiomas."
- L2 2026-11-22 user: "si, haz todo o pendiente"

- L3 2026-11-22 user: "mejora los comentarios sueltos pudiéndolos guardar en la base de datos y usando alguna palabra clave o alguna forma en el fen para que se sepa que es un comentario antes de la primera jugada, así que se pueda guardar como comentario suelto y este solo se usaría para casos como este. Corrije lo del marco de la partid 1."
- L4 Intro comments: san "@intro" + ply 0 (PositionCommentStore::INTRO_SAN); listed, excluded from forPosition and top.

# resources-ux-round
Objective: fix resources access in the deployed app and the UX items of the 2026-11-18 request. Branch: main (work-unit commits, tag per version). Delivery: ask-on-risk. Runner: Vitest (apps/web), tsc + eslint last.

## Specs
- S1 Settings resources URL: "primero que se ponga esta por defecto https://github.com/patchamama/chessreader-resources y que se pueda cambiar". A github.com repository URL must work (converted to the contents API).
- S2 "si se pone el token que se pueda comprobar que funciona" — a check button for the resources URL + token.
- S3 Deployed app: "He puesto la url de gh del repo y el token y en el deploy en el frontend no me está mostrando los libros" / "Database Failed to fetch" / "Errors: Recognition errors Could not read the resources: Failed to fetch". Root cause: the github.com URL was fetched directly (no CORS).
- S4 My games: "muestra solo los años y meses que contengan juegos y entre paréntesis la cantidad de juegos en esa categoría, y pon opción de listar todo sin la categoría por años/meses".
- S5 "En las soluciones de puzzles y donde quiera que se pongan evaluaciones o respuestas en formato de anotación de ajedrez, de ser posible y si no da error, poner las miniaturas y claro, si se tiene el fen o inicio de un puzzle o jugada, poner el play con los botones para reproducirlos en las respuestas".
- S6 "también poner de ser posible información de patrones y jugadas, quizás en una sesión de info en cada apartado que se pueda desplegar y de esta forma siempre informar en cada lenguaje elegido de forma educativa con información adicional y puedes obtener la información de diferentes blogs, wikipedia".
- S7 "En el caso de enlaces a juegos de lichess, además de la opción de abrilo en lichess, poner opción de abrirlo con la app en el apartado de estudio, que permita poner opciones de comentarios y todo lo ahí implementado".
- S8 "No veo la opción en el tablero que me permite poner la partida en modo párrafo los comentarios o en modo tipo pgn con los corchetes".
- S9 Examples: "ni tampoco me salen los ejemplos que me gustaría que salgan siempre a no ser que se marque un icono en estos de cerrar que determinaría que se cierre ese ejemplo pero desde settings se pudiera siempre resetear esa parte y mostrar todos los ejemplos".

## Tasks
- [x] T1 S1–S3 resources URL default, github.com URL normalisation, check button — inline
- [x] T2 S9 example books always shown, dismiss per example, reset in Settings — inline
- [x] T3 S8 layout toggle visible on the study board — inline
- [x] T4 S4 my games: only years/months with games, counts, flat list option — inline
- [ ] T5 S7 open Lichess games in the study reader — inline
- [x] T6 S5 thumbnails + replay player in notation answers — inline
- [x] T7 S6 collapsible educational info per section (patterns, moves; Wikipedia/blog links), per language — inline

## Log
- L1 2026-11-18 user request (verbatim): "arregla que al poner en settings la url de gh con los resources, primero que se ponga esta por defecto https://github.com/patchamama/chessreader-resources y que se pueda cambiar y segundo que si se pone el token que se pueda comprobar que funciona. En la parte en que se muestra el historial de juegos por año y mes, muestra solo los años y meses que contengan juegos y entre paréntesis la cantidad de juegos en esa categoría, y pon opción de listar todo sin la categoría por años/meses. En las soluciones de puzzles y donde quiera que se pongan evaluaciones o respuestas en formato de anotación de ajedrez, de ser posible y si no da error, poner las miniaturas y claro, si se tiene el fen o inicio de un puzzle o jugada, poner el play con los botones para reproducirlos en las respuestas, también poner de ser posible información de patrones y jugadas, quizás en una sesión de info en cada apartado que se pueda desplegar y de esta forma siempre informar en cada lenguaje elegido de forma educativa con información adicional y puedes obtener la información de diferentes blogs, wikipedia. En el caso de enlaces a juegos de lichess, además de la opción de abrilo en lichess, poner opción de abrirlo con la app en el apartado de estudio, que permita poner opciones de comentarios y todo lo ahí implementado. No veo la opción en el tablero que me permite poner la partida en modo párrafo los comentarios o en modo tipo pgn con los corchetes. He puesto la url de gh del repo y el token y en el deploy en el frontend no me está mostrando los libros, ni tampoco me salen los ejemplos que me gustaría que salgan siempre a no ser que se marque un icono en estos de cerrar que determinaría que se cierre ese ejemplo pero desde settings se pudiera siempre resetear esa parte y mostrar todos los ejemplos. En la parte del frontend me está saliendo en: Database Failed to fetch e igual en Errors: Recognition errors Could not read the resources: Failed to fetch"
- L2 Root cause S3 (verified): commentLookup.getResource fetches `${commentDbUrl}/${path}`; the field expects the contents API URL, so a github.com URL is fetched from github.com, which has no CORS → "Failed to fetch".
- L3 T2: deploy showed a login form before the library (RequireApproved), so no example appeared; the demo now opens without login (its mock API needs none). T3: the ¶/{ } switch lived only inline before the first move; now also on the study board toolbar for the current game.

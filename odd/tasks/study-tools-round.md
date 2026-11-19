# study-tools-round
Objective: diagrams/evaluations tools, reader UX (footer, spinner, game containers, anchors), study board actions, recognition of list markers, analysis board tab, piece notation, training (offline, learning mode, traps), play (GM suggestions, live comments, tutor). Branch: main (work-unit commits + tag). Runners: Vitest (apps/web, packages/chess-shared), PHPUnit; tsc + eslint last. Dev stack: web :5173, API :8090.

## Specs (user's words, grouped; full message in L1)
- S1 Diagrams: "funcione la opción de regenerar diagrama usando un icono sobre el diagrama pequeño en la parte superior derecha ... cambia el icono de regenerar cada diagrama por uno pequeño minimalista de refresh que se muestre un poco por encima del diagrama para que no ocupe parte del espacio y visibilidad del mismo"; default diagram style: "en blanco y negro con las casillas como con rallas en diagonal que es muy limpio y me gustaría ese diagrama por defecto".
- S2 Evaluations: "en las evaluaciones me gustaría que aparezca un pequeño icono de refresh minimalista que permita regenerar la evaluación".
- S3 Control panel (right, end): "regenerar todos los diagramas del texto y descargar las imagenes ... las imagenes deben de tener el mismo nombre que como se referencia o su nombre de archivo usado en el texto"; "botón de regenerar evaluaciones y descargarlas ... con el motor que se elija y descargar cada evaluación usando como nombre el archivo de la imagen en que se encuentra a continuación y debe de ser un archivo de texto que contiene dentro la evaluación".
- S4 "si se cambia el tamaño de la ventana de la app, que la barra de estado del footer aparezca siempre en el footer y que se adecue el espacio del contenido visible a la pantalla completa".
- S5 "líneas que empiecen con a), b), a1), b2), c1), y así, que no se resalten esas partes".
- S6 Actions: spinner on ¶/{ } and comment-game actions; "cada partida debe de estar en un div o algo así que permita guardar su estado actual ... reemplazar su contenido al regenerarse"; "debe de mantenerse la posicion que se está visualizando"; "el div que se acaba de actualizar tenga un efecto como de parpadeo, o cambio de tamaño de letras o cambio de color de fondo por unos segundos".
- S7 Study board: review "+ Trainer", "Guess the Move", "Trainer", improve them, move them to icons in the top bar; "quita el mensaje "STUDY BOARD"".
- S8 "Si se detecta que faltan imagenes del epub ... que automáticamente se regeneren por la app teniendo en cuenta las jugada que se han hecho hasta ese momento".
- S9 "Como ahora se pueden corregir partidas y jugadas, entonces habría que parsear nuevamente los comentarios de los libros y nuevos comentarios ... guardar en el repo de resources".
- S10 "Si se cambiara el ancho de la columna, debe de ponerse un anchor ... no debe de perderse la parte visual del principio del texto que se está visualizando".
- S11 "opción de tablero de análisis que debe de aparecer después de "Library" ... tabs por tablero y cada tab tiene el nombre del libro ... se pueden cerrar".
- S12 "icono en el tablero de análisis que permita mostrar las piezas con la figura de la pieza o con letras usando la letra del idioma seleccionado ... también esta opción en settings".
- S13 Training: offline copy of all contents (no Lichess needed); wrong move shown with arrows/highlighted squares (example: "Celada del pardillo ... 4. d3 — No es la jugada de la celada. Era Ne7."); learning mode step by step then practice; "Sobre esta celada" opens another board — must not; idea text moves clickable/replayable with mini boards; squares/diagonals highlighted and clickable ("ataque a f7"); notation in the selected language/figurines; selected piece shows legal squares; Lococo traps link to the book trap/explanation readable on the analysis board; listbox of first moves (e4, d4…); "intentar celada" practice vs engine/human with live filter of candidate traps and continuations; captured pieces shown small per side; board container not deformed by the right column (align top).
- S14 Play: lower priority "juegue como un gran maestro humano" suggestions from the books DB (candidate moves, evaluation, how the games ended and who played); live human comments from the comments DB for the position, for both or one side; tutor ideas highlight moves/squares (e.g. "Cd5. Ataque doble: el caballo ataca a la vez el peón de c7 y la dama de e7." → arrow + squares, voice if on, hover shows); "Colorear las jugadas de la pieza elegida" precomputed piece by piece for the engine's top 3–5 moves while waiting; repeated consecutive tutor comments blink + "(2x)"; always show elapsed thinking time; tutor panel scrollable, auto-scroll to latest; touching a piece in tutor mode analyses the repercussions (opponent's best reply) and writes them.

- S15 Traps by position (FEN), not move order: "lo más importante no es el orden en que se juegan las piezas, sino la configuración del tablero en cada momento, así que la propuesta de las próximas jugadas para completar una celada depende más del fen de cada posición que el orden en sí mismo ... implementar esa forma ... tanto en la parte de training como en play si se elije la opción de intentar celada."
- S16 Try a trap board: hovering a move in "Moves that keep traps on the board" shows it on the board (squares + arrows); always a back control; the moves played so far are clickable to go back and try another branch (variants from any position); clicking any piece shows in green, with changing arrows, the continuations that complete a trap with that piece.
- S17 "Pon en tablero de training de celadas y otros de training siempre una opción que permita poner la barra de evaluación con texto de evaluación del motor"; "siempre opción de cambiar o girar tablero en tablero de training y debe de estar esta opción también en tablero de análisis siempre."
- S18 "revisa que se vean los estilos de títulos, subtitulos, que las imagenes aparezcan al abrirse un libro."

## Tasks
- [x] T1 S1 S2 S3 S8 diagrams & evaluations tools — W1 (wave 1)
- [x] T2 S4 S6 S7 S10 reader & study board UX — W2 (wave 1)
- [x] T3 S5 S9 list markers + comment DB rebuild with errata — W3 (wave 1)
- [x] T4 S11 S12 analysis board tab + piece notation — W4 (wave 2)
- [x] T5 S13 training — W5 (v0.113.0, v0.113.1)
- [x] T6 S14 play (v0.115.0) — W6 (wave 2)
- [ ] T7 S15 S16 S17 traps by FEN, try-a-trap board, eval bar + flip — W7
- [x] T8 S18 book styles/images check — parent

## Log
- L1 2026-11-18 user message (verbatim): see the conversation; quoted above per spec. Followed by "Ich habe mein Nutzungslimit erreicht ... Bitte mache dort weiter, wo du aufgehört hast."
- L2 2026-11-19 user: S15–S18 (quoted in Specs), then the usage-limit resume note.
- L3 2026-11-19 T8 browser check: Kasparov I cap. 2 — 181/181 images, h1 "Capítulo dos - Emanuel II", h3 subheadings bold 19px, 344 italic/cite elements, book stylesheet applied; Lococo ch.9 — 48 tables with borders, rating icons in cells not turned into diagrams; book 13 ch.4 10/10 images; "Al ataque" EPUB has no CSS at all. Observed: spine parts without a TOC entry show as "Chapter N".

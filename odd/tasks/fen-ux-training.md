# FEN fragments, board UX, accounts, traps, patterns and the resources repo
Objective: read games that start from a FEN, make the reader and board survive refreshes and work like a study board, unify Lichess/chess.com accounts, add trap and pattern training, a book game database with search and statistics, a level test, diagram-image FENs, and start scripts. Plan: ~/.claude/plans/flickering-knitting-stearns.md.
Delivery: one commit + tag per phase on main, pushed (user's standing instruction). Runner: Vitest, PHPUnit, tsc, ESLint (last step before each commit). Book texts never committed; private data goes to the private repo `chessreader-resources`.

## Specs
- S1 "fíjate en las jugadas encontradas como no legales o que fallan en los libros sí existe un fen, pues hay parte de los libros con fen que indican que ahí empieza un nuevo juego en una posición predefinida, se están reconociendo los FEN que aparecen en los textos de nuevas partidas ya iniciadas?"
- S2 "creo que el algoritmo 3 falla mucho y no es necesario su uso, por lo que se podría desactivar y usar el 1 o 2 según sea necesario, aunque quizás el 2 puede funcionar solamente con todas las opciones existentes, simplemente con opción de solo línea principal o con variantes."
- S3 "agrega en el play, propuestas ante las jugadas que se presenten de ideas a desarrollar como aperturas, ideas de celadas (ver libro y otras referencias de celadas), también que se muestren puntos a atacar porque hay casillas débiles o posiciones que sería bueno tomar, me interesa mucho sobretodo la idea de practicar celadas cuando sea posible"
- S4 "investiga sí hay alguna base de datos en lichess o internet con Chess Pattern Recognition y aprende de estos y además muéstralos en las jugadas comentadas y además en las partidas que haga."
- S5 "deseo que se responsive pero también que en modo desktop muestre varias opciones de mostrarse con más ancho y usa el footer para mostrar cosas que están ocurriendo en el apartado que se está mostrando como posición de partida, evaluaciones, modo de juego, tiempo que va transcurriendo"
- S6 "en el play brinda a la hora de jugar o elegir con qué jugar, opción de jugar aleatorio también."
- S7 "Al poner una evaluación de un pie de página de un diagrama, pon opción de mostrar miniatura en cada posición de la evaluación."
- S8 "corrije que al poner el mouse sobre una posición en un comentario, que se muetre en el diagrama principal esa jugada mientras el mouse está sobre ese resaltado pero al quitarse que se vuelva a mantener la jugada original y el diagrama original que había, a no ser que se pulse clic en el resaltado o que la última jugada que se hizo fue la correspondiente a ese comentario."
- S9 "Permite en el tablero que muestra las jugadas principal que se puedan poner flechas de diferentes colores, que se puedan marcar casillas y todas esas opciones que permitan comentar partidas usando un tablero."
- S10 "Al pulsar en una jugada o notación de jugada, deseo que automáticamente se haga un scroll para mostrar el tablero visiblemente, pero también me gustaría que se ponga una opción que permita en el mismo tablero en modo modal para verlo a pantalla completa mostrando de forma minimalista en dos líneas las jugadas con scroll y miniaturas en hint que se están reproduciendo y además la evaluación del motor, también próximo, anterior, links en las jugadas, opción de pausa, seguir, retroceder 5, 10, 15 segs sí se está reproduciendo con voz la partida y pequeño icono de configuración"
- S11 "Si se está mostrando una jugada y en el navegador se pulsa refrescar, automáticamente se pierde todo, el texto, la jugada actual, así que deseo que se guarde todo en el localstorage"
- S12 "que se pueda acceder a los juegos que estén guardados en lichess ... listar organizadas como en una secuencia que despliega apartados por año - mes de forma cronológica los juegos de lichess (o chess.com si se tienen las credenciales, también habría que integrar si es posible chess.com también para jugar en esa plataforma), con informacion de las partidas, cantidad de jugadas, como terminó, elo de los jugadores. ... que se muestre la cantidad de jugadas de cada juego."
- S13 "Guarda en el localstorage el token de lichess, de forma que no se pida constantemente en diferentes lugares ... en la parte de settings pon un parte en que se pueda poner el token de lichess y lo que se necesite de chess.com"
- S14 "que se pueda usar un evaluador del nivel de uno ... o dime que opciones pueden haber"
- S15 "el repo con todas las partidas , recursos, comentarios, base de datos sqlite ... un tocken que permita desbloquear el acceso a ese repo y ahí también se pudieran guardar los libros de forma privada ... búsquedas por jugadores, descripción de los jugadores (sacar información también de wikipedia), mostrar los diferentes tipos de aperturas ... ejercicios con los juegos existentes ... estadísticas en que se muestren gráficos y tablas" — repo: "chessreader-resources"
- S16 "el de las celadas (trampas) ... desarrollar una base de entrenamiento que permita el aprendizaje de la celada ayudando a memorizar las ideas y como funciona, búsquedas por diferentes campos"
- S17 "agrega al proyecto un start.sh y start.bat que permita instalar todos los requerimientos necesarios en el sistema y levantar el backend y frontend. No es posible instalar lc0 y la redes de Maia (si es posible con soporte para mac silicon para el uso de la gpu) de forma automática?"
- S18 "puede ser que aparezcan miniaturas y a partir de ahí sigue la partida con esa miniatura pero el fen falta, sería posible analizar las imagenes extraer el fen por ocr a partir de la miniatura e insertar en los epub el fen en caso de ser esa la causa si las jugadas después son correctas?"
- S19 (added 2026-11-18) "cuando se muestre una partida con comentarios entre corchetes, mostrar icono que permita al principio de la partida cambiar el formato para que aparezcan los comentarios como párrafo y lo contrario también."
- S20 (added 2026-11-18) "También pon opción de descargar fen de la partida que siempre esté también disponible junto con la opción de descargar pdf y otros formatos." Assumption: FEN of the current position plus the game's PGN.

## Tasks
- [x] T1 S1–S2 FEN fragments + algorithm choice — inline — v0.78.0
- [ ] T2 S8–S9, S11 persistence, hover restore, scroll to board, coloured arrows/marks — inline — v0.79.0
- [ ] T3 S10, S7 fullscreen board modal; thumbnails in diagram eval footers — inline — v0.80.0
- [ ] T4 S5 width setting + status footer — inline — v0.81.0
- [ ] T5 S12–S13 accounts in Settings, my games by year/month, move counts — inline — v0.82.0
- [ ] T6 S3, S6 Play random colour, ideas, targets, traps — inline — v0.83.0
- [ ] T7 S4 pattern DB + trainer + labels — inline — v0.84.0
- [ ] T8 S16 trap DB + trainer — inline — v0.85.0
- [ ] T9 S15 resources repo, game DB, search, players, openings, exercises, stats — inline — v0.86–0.87
- [ ] T10 S14 level test — inline — v0.88.0
- [ ] T11 S18 diagram images → FEN — inline — v0.89.0
- [ ] T13 S19–S20 comment layout toggle in the reader, FEN/PGN download always available — inline — v0.79.x
- [ ] T12 S17 start.sh / start.bat, lc0 + Maia install — inline — v0.90.0

## Log
- L1 2026-11-18 user request (verbatim fragments in S1–S18; full text in session transcript 59547ab6).
- L2 Evidence: recognizeGames ignores FEN lines (fragment "26 Qe3…" after a FEN → 0 games); Kasparov I–V ~240 FEN lines, Gude 1 31, Tal 4. chess.com API is read-only (no play/login). Lichess puzzle DB CC0, 6.19M puzzles with themes.
- L3 T1: FEN lines start a game from their position (tokenizer `fen` token, builder numbers plies from the FEN's move counter, FEN read from the original text so Spanish letters never touch it). Differential: 3164 PGN games 0 differences. Kasparov I–V games 728 → 943 (+215), plies +2114; Gude 1 +29 games/+572 plies. Errors rose (e.g. Kasparov II 569 → 803) because analysis lines of fragments that used to be dropped silently are now read; new errors are inside deep analysis, same kinds as before. Algorithm 3 retired from the UI (settings v2 migrates 3 → 2), Settings → Recognition: with variations / main line only.

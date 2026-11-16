# Instructive narration, demo games, move repair and game search
Objective: make the reader an instructive game player — annotated demo games, detection/repair of wrong moves, spoken narration synced with the board, board cues for everything the commentary mentions, and a search for annotated games. Branch: main (user asked to commit and push to origin main; the demo deploys from main).
Delivery: one commit per task, pushed to main after its checks. Runner: Vitest (apps/web, packages/chess-shared), tsc, ESLint; Playwright smoke on the demo build.

## Specs
- S1 "agrega varios ejemplos al demo en github comentados con partidas completas (creo que los existentes ahora tienen problemas) y hacer deploy con estos."
- S2 "crear en partidas existentes algunas jugadas erróneas y programar que de forma inteligente se detecten las jugadas erróneas y se proponga la corrección teniendo en cuenta la secuencia posterior de la partida."
- S3 "crear opción de comentar partida, que lo que haría sería generar un audio con la partida completa como si alguien estuviera narrando el audio pero debe de hacer de tal forma que en cada jugada en el tablero se pueda reproducir de forma automática cuando toca la jugada, mostrándola en el tablero, y también que exista una opción en que se espere a la jugada en el tablero (mostrándola) tras anunciarla, pero manualmente uno debe de mover las piezas"
- S4 "siempre deben de mostrarse en el tablero con luces o colores los comentarios, por ejemplo, si se dice en la narración o texto que hay una jugada en una diagonal, esa diagonal debe de mostrarse con colores, si se comenta de una pieza en una posición determinada, debe de mostrarse esa pieza parpadeando o iluminada, si se dice que una pieza en una posición ataca a una otra pieza, ambas deben de iluminarse (también poner opción de simulación de jugada que puede determinar en la narración que se hace como el movimiento de la pieza de una posición a otra, y la posición final, desaparece la pieza que estaba ahí y se pone la nueva pieza, o igual con la movida de una pieza de un lugar a otro), también mostrar comentando en el tablero usando colores, cuando se mencionan casillas determinadas, piezas nombradas, casillas a las que se ataca, casillas débiles, enroques, capturas, es decir, todo lo que esté en comentarios que comente sobre una casilla, varias casillas de unas determinadas piezas como peones (peones ligados, peones continuos), casillas desprotegidas"
- S5 "(también ir progresivamente mostrando conceptos que se mencionen en la narración por si se desean ver, como casillas débiles, alfil malo, ataque doble, rayos x, captura al paso, enfilada, peón rechazado, gambito, celadas,...). Todo lo que se pueda resaltar en un tablero y que pueda ser instructivo para alguien que está mirando el juego y que está aprendiendo."
- S6 "Ten en cuenta que la idea es que ese simulador con el tablero digital, en el futuro se pueda reproducir en un tablero físico que tiene luces y que se interactuará con el directamente a modo de enseñanza."
- S7 "También pon un buscador en lichess y chess.com (si este último lo tiene) en que se puedan buscar partidas anotadas, instructivas o que tengan para aprender diferentes temas como aperturas, tácticas, conceptos, partidas clásicas, ..."

- S8 (added 2026-11-16) "revisa también que puede haber varias partidas en un texto, y a veces he visto que da error cuando vuelve a empezar otra partida, tratando de seguirse la última jugada de la partida anterior, cuando debe de reiniciarse el tablero y eso se detecta cuando de pronto empieza con una jugada 1. algo de las blancas, o si hay un diagrama y un inicio de una partida en una determinada jugada."

Assumptions (not user statements): narration audio uses the browser Web Speech API (no key, works on the static demo, gives per-utterance events to sync the board); board cues are a device-independent data model (squares + colour role + effect) so an LED board can consume the same stream (S6).

## Tasks
- T1 [S1] inline — annotated complete demo games + deploy. Status: done (v0.36.0); 6 chapters in 2 books, each verified: full mainline with algorithms 1-3, every written move legal and painted, ends in mate; browser smoke in demo mode OK.
- T2 [S2] inline — wrong-move detection and repair proposals. Status: done (v0.37.0); packages/chess-shared/src/pgn/moveRepair.ts + mainline builder (algorithms 1-2), red wavy span + error panel proposal, demo book 3 with three planted misprints.
- T3 [S4,S5,S6] inline — board cue model + commentary analyser + board rendering. Status: pending.
- T4 [S3] inline — narration player (auto / wait-for-move modes). Status: pending.
- T5 [S7] inline — annotated game search (Lichess; chess.com if its API allows). Status: pending.
- T6 [S8] inline — several games in one text: restart on a new game, fragments after a diagram. Status: pending.

## Log
- L1 (2026-11-16) user request, verbatim in S1–S7, preceded by "COMMIT + push origin main." (done: e2bfcac v0.34.0, c17bd52 v0.35.0 pushed with tags).
- L2 Route: all inline, no writer trigger (tasks depend on each other: T4 needs T3's cue model). CI was already red since v0.27.0 from 4 lint errors; fixed in a separate commit.
- L3 T1: replaced the old demo chapters (wrong attributions, single chapter per book) with apps/web/src/demo/demoGames.ts; the handler now serves chapters by order. Known limit: algorithm 3 takes a numbered threat in prose ("Amenaza 15. Bxf4") as a mainline move; the demo text avoids it.
- L4 T2 evidence: fuzz on 40 real Lichess games (temporary harness, not committed): 0 repairs proposed on clean games; 216 injected one-square typos → 203 detected, 187 (87%) restored to the exact original line; 14 of the 29 misses had the true move among the low-confidence alternatives. Undetected typos are ones that stay legal and never contradict a later move. Algorithm 3 (legacy) has no repair.
- L5 (2026-11-16) user added S8 verbatim while T2 was in progress → T6.

import type { Book } from '../features/library/api/libraryApi'

/**
 * Demo library: complete, annotated classic games. Each chapter is one game
 * written the way a chess book prints it — the mainline in its own paragraphs,
 * comments in prose, side lines in parentheses or after "Si …".
 *
 * `plies` is the length of the real game; the demo test asserts the recogniser
 * reads exactly that mainline from the chapter, with no recognition errors.
 */
export interface DemoChapter {
  title: string
  /** Half-moves of the complete game (the expected mainline length). */
  plies: number
  /** Misprints planted on purpose: [written, correction] in text order. */
  misprints?: [string, string][]
  html: string
}

export interface DemoBook {
  book: Book
  chapters: DemoChapter[]
}

const OPERA_ES: DemoChapter = {
  title: 'La partida de la Ópera',
  plies: 33,
  html: `
<h2>La partida de la Ópera</h2>
<p><em>Paul Morphy — Duque de Brunswick y Conde Isouard, París 1858</em></p>
<p>Jugada en un palco de la Ópera de París, es la lección más famosa sobre el desarrollo rápido de las piezas.</p>
<p>1. e4 e5 2. ♘f3 d6</p>
<p>La Defensa Philidor. Las negras sostienen el peón de e5, pero encierran a su alfil de f8.</p>
<p>3. d4 ♗g4</p>
<p>Una clavada sobre el caballo de f3 que aquí resulta prematura. Lo normal es 3... exd4 4. ♘xd4 ♘f6.</p>
<p>4. dxe5 ♗xf3</p>
<p>Obligado. Si 4... dxe5 5. ♕xd8+ ♔xd8 6. ♘xe5 las blancas ganan un peón.</p>
<p>5. ♕xf3 dxe5 6. ♗c4</p>
<p>Amenaza mate en f7: la dama de f3 y el alfil de c4 apuntan juntos a la casilla f7.</p>
<p>6... ♘f6 7. ♕b3</p>
<p>Un ataque doble. La dama ataca el peón de b7 y aumenta la presión sobre f7 por la diagonal a2-g8.</p>
<p>7... ♕e7</p>
<p>Defiende f7, pero la dama bloquea al alfil de f8. Morphy podía ganar un peón (8. ♕xb7 ♕b4+ 9. ♕xb4 ♗xb4+), pero prefiere seguir desarrollando piezas.</p>
<p>8. ♘c3 c6 9. ♗g5 b5</p>
<p>Las negras quieren expulsar al alfil de c4, pero están muy atrasadas en desarrollo. Ahora llega el sacrificio.</p>
<p>10. ♘xb5 cxb5 11. ♗xb5+ ♘bd7 12. O-O-O</p>
<p>El enroque largo lleva la torre a la columna d. El caballo de d7 está clavado por el alfil de b5 y el caballo de f6 por el alfil de g5.</p>
<p>12... ♖d8 13. ♖xd7 ♖xd7 14. ♖d1</p>
<p>La torre de d7 queda clavada y la segunda torre blanca entra en juego. Todas las piezas blancas atacan; el alfil de f8 y la torre de h8 todavía no han jugado.</p>
<p>14... ♕e6</p>
<p>Desclava el caballo de f6 y ofrece el cambio de damas.</p>
<p>15. ♗xd7+ ♘xd7 16. ♕b8+</p>
<p>¡Sacrificio de dama! El caballo tiene que capturar y abandona la defensa de la casilla d8.</p>
<p>16... ♘xb8 17. ♖d8#</p>
<p>Mate. El alfil de g5 controla la diagonal d8-h4 y la torre da mate en la octava fila.</p>`,
}

const IMMORTAL_ES: DemoChapter = {
  title: 'La Inmortal',
  plies: 45,
  html: `
<h2>La Inmortal</h2>
<p><em>Adolf Anderssen — Lionel Kieseritzky, Londres 1851</em></p>
<p>Las blancas entregan un alfil, las dos torres y la dama para dar mate con sus tres piezas menores.</p>
<p>1. e4 e5 2. f4 exf4</p>
<p>El Gambito de Rey aceptado. Las blancas entregan el peón de f4 para dominar el centro y abrir la columna f.</p>
<p>3. ♗c4 ♕h4+ 4. ♔f1 b5</p>
<p>El jaque quita el enroque a las blancas. Con 4... b5 las negras devuelven el peón para desviar al alfil de la diagonal a2-g8.</p>
<p>5. ♗xb5 ♘f6 6. ♘f3 ♕h6 7. d3 ♘h5</p>
<p>El caballo defiende el peón de f4 y amenaza un jaque en g3.</p>
<p>8. ♘h4 ♕g5 9. ♘f5 c6</p>
<p>La dama ataca a la vez el caballo de f5 y el alfil de b5. Mejor era 9... g6.</p>
<p>10. g4 ♘f6 11. ♖g1</p>
<p>Anderssen deja el alfil de b5 sin defensa: prefiere ganar tiempos contra la dama negra.</p>
<p>11... cxb5 12. h4 ♕g6 13. h5 ♕g5 14. ♕f3</p>
<p>Amenaza capturar en f4 con el alfil: la dama negra no tendría casillas. El caballo debe volver a su casilla inicial.</p>
<p>14... ♘g8 15. ♗xf4 ♕f6 16. ♘c3 ♗c5 17. ♘d5</p>
<p>El caballo ocupa la casilla central d5 y ataca a la dama. Las blancas ofrecen ahora las dos torres.</p>
<p>17... ♕xb2 18. ♗d6</p>
<p>Una jugada de bloqueo: el alfil corta la diagonal del alfil de c5 hacia la casilla e7.</p>
<p>18... ♗xg1</p>
<p>Si 18... ♕xa1+ 19. ♔e2 ♕xg1 20. ♘xg7+ ♔d8 21. ♗c7#.</p>
<p>19. e5</p>
<p>El peón cierra la diagonal a1-h8: la dama negra ya no defiende la casilla g7.</p>
<p>19... ♕xa1+ 20. ♔e2 ♘a6</p>
<p>Defiende la casilla c7, pero el mate llega por otro lado.</p>
<p>21. ♘xg7+ ♔d8 22. ♕f6+</p>
<p>¡Sacrificio de dama! El caballo de g8 tiene que capturar y deja libre la casilla e7.</p>
<p>22... ♘xf6 23. ♗e7#</p>
<p>Mate con tres piezas menores: el alfil da jaque en e7 y los caballos de d5 y g7 cubren las casillas de escape.</p>`,
}

const EVERGREEN_ES: DemoChapter = {
  title: 'La Siempreviva',
  plies: 47,
  html: `
<h2>La Siempreviva</h2>
<p><em>Adolf Anderssen — Jean Dufresne, Berlín 1852</em></p>
<p>1. e4 e5 2. ♘f3 ♘c6 3. ♗c4 ♗c5 4. b4</p>
<p>El Gambito Evans. Las blancas entregan el peón de b4 para ganar tiempos y construir un centro fuerte.</p>
<p>4... ♗xb4 5. c3 ♗a5 6. d4 exd4 7. O-O d3</p>
<p>Las negras devuelven el peón para que el caballo blanco no llegue a c3. Más sólido es 7... ♘ge7.</p>
<p>8. ♕b3 ♕f6</p>
<p>La dama y el alfil de c4 atacan f7 por la diagonal a2-g8; la dama negra lo defiende.</p>
<p>9. e5 ♕g6 10. ♖e1 ♘ge7 11. ♗a3</p>
<p>El alfil apunta por la diagonal a3-f8 al caballo de e7. El rey negro sigue en el centro.</p>
<p>11... b5 12. ♕xb5 ♖b8 13. ♕a4 ♗b6 14. ♘bd2 ♗b7 15. ♘e4 ♕f5 16. ♗xd3 ♕h5</p>
<p>Las negras preparan un contraataque por la columna g contra el rey blanco.</p>
<p>17. ♘f6+</p>
<p>Un sacrificio para abrir la columna e, donde está el rey negro.</p>
<p>17... gxf6 18. exf6 ♖g8 19. ♖ad1</p>
<p>Una jugada tranquila y profunda. Las negras amenazan mate en g2, pero Anderssen ha visto más lejos.</p>
<p>19... ♕xf3</p>
<p>Captura el caballo y amenaza mate en g2. Era mejor 19... ♕h3.</p>
<p>20. ♖xe7+ ♘xe7</p>
<p>Si 20... ♔d8 21. ♖xd7+ ♔c8 22. ♖d8+ las blancas también ganan.</p>
<p>21. ♕xd7+</p>
<p>¡Sacrificio de dama! El rey tiene que capturar y queda expuesto en la columna d.</p>
<p>21... ♔xd7 22. ♗f5+</p>
<p>Jaque doble de la torre de d1 y del alfil: el rey tiene que moverse.</p>
<p>22... ♔e8 23. ♗d7+ ♔f8 24. ♗xe7#</p>
<p>Mate. El alfil de e7 está defendido por el peón de f6 y el alfil de d7 cubre la casilla e8.</p>`,
}

const CENTURY_ES: DemoChapter = {
  title: 'La partida del siglo',
  plies: 82,
  html: `
<h2>La partida del siglo</h2>
<p><em>Donald Byrne — Robert Fischer, Nueva York 1956</em></p>
<p>Bobby Fischer tenía trece años cuando jugó esta partida.</p>
<p>1. ♘f3 ♘f6 2. c4 g6 3. ♘c3 ♗g7 4. d4 O-O 5. ♗f4 d5</p>
<p>Una reacción automática habría sido 5... d6. Pero Bobby quiere la Defensa Grünfeld.</p>
<p>6. ♕b3</p>
<p>Las blancas mezclan dos sistemas. Más sólido es 6. ♖c1.</p>
<p>6... dxc4 7. ♕xc4 c6 8. e4 ♘bd7 9. ♖d1</p>
<p>Refuerza el peón de d4. Si 9. e5 ♘d5 10. ♘xd5 cxd5 11. ♕xd5 ♘xe5 las negras recuperan el peón con buen juego.</p>
<p>9... ♘b6 10. ♕c5</p>
<p>La dama queda expuesta en c5. Más seguro es 10. ♕b3.</p>
<p>10... ♗g4 11. ♗g5</p>
<p>Un error: las blancas mueven otra vez una pieza ya desarrollada y su rey sigue en el centro. Era necesario 11. ♗e2.</p>
<p>11... ♘a4</p>
<p>¡Una jugada brillante! El caballo se ofrece en a4. Si 12. ♘xa4 ♘xe4 13. ♕c1 ♕a5+ 14. ♘c3 ♗xf3 15. gxf3 ♘xg5 las negras ganan un peón y destrozan los peones blancos.</p>
<p>12. ♕a3 ♘xc3 13. bxc3 ♘xe4</p>
<p>El caballo captura el peón central y ataca al alfil de g5 y al peón de c3.</p>
<p>14. ♗xe7 ♕b6 15. ♗c4</p>
<p>Si 15. ♗xf8 ♗xf8 16. ♕b3 ♘xc3 las negras tienen un ataque muy fuerte.</p>
<p>15... ♘xc3 16. ♗c5 ♖fe8+ 17. ♔f1</p>
<p>El rey blanco ha perdido el enroque y la dama negra está atacada. Llega la jugada más famosa de la partida.</p>
<p>17... ♗e6</p>
<p>¡Sacrificio de dama! Si 18. ♗xe6 ♕b5+ 19. ♔g1 ♘e2+ 20. ♔f1 ♘g3+ 21. ♔g1 ♕f1+ 22. ♖xf1 ♘e2# es un mate ahogado.</p>
<p>18. ♗xb6 ♗xc4+ 19. ♔g1 ♘e2+ 20. ♔f1 ♘xd4+</p>
<p>El molino: el caballo da jaques a la descubierta con el alfil de c4 y va capturando material.</p>
<p>21. ♔g1 ♘e2+ 22. ♔f1 ♘c3+ 23. ♔g1 axb6 24. ♕b4 ♖a4 25. ♕xb6 ♘xd1</p>
<p>Las negras tienen torre y dos alfiles por la dama, y todas sus piezas colaboran.</p>
<p>26. h3 ♖xa2 27. ♔h2 ♘xf2 28. ♖e1 ♖xe1 29. ♕d8+ ♗f8 30. ♘xe1 ♗d5</p>
<p>El alfil domina la gran diagonal y protege la casilla f7.</p>
<p>31. ♘f3 ♘e4 32. ♕b8 b5 33. h4 h5 34. ♘e5 ♔g7 35. ♔g1 ♗c5+</p>
<p>Empieza la caza del rey: todas las piezas negras atacan.</p>
<p>36. ♔f1 ♘g3+ 37. ♔e1 ♗b4+ 38. ♔d1 ♗b3+ 39. ♔c1 ♘e2+ 40. ♔b1 ♘c3+ 41. ♔c1 ♖c2#</p>
<p>Mate. La torre está defendida por el alfil de b3 y el caballo de c3 cubre las casillas b1 y d1.</p>`,
}

const OPERA_EN: DemoChapter = {
  title: 'The Opera Game (PGN style)',
  plies: 33,
  html: `
<h2>The Opera Game</h2>
<p><em>Paul Morphy — Duke of Brunswick and Count Isouard, Paris 1858</em></p>
<p>The same game written as an annotated PGN: comments in braces, variations in parentheses.</p>
<p>1. e4 e5 2. Nf3 d6 { The Philidor Defence. } 3. d4 Bg4 { A premature pin on the knight on f3. } (3... exd4 4. Nxd4 Nf6) 4. dxe5 Bxf3 (4... dxe5 5. Qxd8+ Kxd8 6. Nxe5) 5. Qxf3 dxe5 6. Bc4 { Threatening mate on f7. } 6... Nf6 7. Qb3 { A double attack on b7 and f7. } 7... Qe7 8. Nc3 (8. Qxb7 Qb4+ 9. Qxb4 Bxb4+) 8... c6 9. Bg5 b5 10. Nxb5 { The sacrifice. } 10... cxb5 11. Bxb5+ Nbd7 12. O-O-O { The knight on d7 is pinned by the bishop on b5. } 12... Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ { The queen sacrifice. } 16... Nxb8 17. Rd8# 1-0</p>`,
}

const LEGAL_EN: DemoChapter = {
  title: "Légal's Mate",
  plies: 13,
  html: `
<h2>Légal's Mate</h2>
<p><em>Légal de Kermeur — Saint Brie, Paris 1750</em></p>
<p>The oldest trap in the book: a pinned knight moves anyway.</p>
<p>1. e4 e5 2. Nf3 d6 3. Bc4 Bg4</p>
<p>Black pins the knight on f3 against the queen on d1.</p>
<p>4. Nc3 g6</p>
<p>A wasted move. Black had to develop with 4... Nf6.</p>
<p>5. Nxe5</p>
<p>The pinned knight moves and gives up the queen. Taking the knight instead (5... dxe5 6. Qxg4) just loses a pawn.</p>
<p>5... Bxd1 6. Bxf7+ Ke7 7. Nd5#</p>
<p>Mate with three minor pieces: the bishop on f7 gives check, the knights on d5 and e5 cover every escape square.</p>`,
}

const LEGAL_ES: DemoChapter = {
  title: 'El mate de Légal',
  plies: 13,
  html: `
<h2>El mate de Légal</h2>
<p><em>Légal de Kermeur — Saint Brie, París 1750</em></p>
<p>La celada más antigua de los libros: un caballo clavado que se mueve igual.</p>
<p>1. e4 e5 2. ♘f3 d6 3. ♗c4 ♗g4</p>
<p>Las negras clavan el caballo de f3 contra la dama de d1.</p>
<p>4. ♘c3 g6</p>
<p>Una jugada perdida. Había que desarrollar con 4... ♘f6.</p>
<p>5. ♘xe5</p>
<p>El caballo clavado se mueve y entrega la dama. Capturar el caballo (5... dxe5 6. ♕xg4) solo pierde un peón.</p>
<p>5... ♗xd1 6. ♗xf7+ ♔e7 7. ♘d5#</p>
<p>Mate con tres piezas menores: el alfil de f7 da jaque y los caballos de d5 y e5 cubren todas las casillas de escape.</p>`,
}

const OPERA_DE: DemoChapter = {
  title: 'Die Opernpartie',
  plies: 33,
  html: `
<h2>Die Opernpartie</h2>
<p><em>Paul Morphy — Herzog von Braunschweig und Graf Isouard, Paris 1858</em></p>
<p>Die berühmteste Lehrpartie über Entwicklung: Weiß bringt jede Figur ins Spiel, Schwarz verliert Zeit.</p>
<p>1. e4 e5 2. ♘f3 d6</p>
<p>Die Philidor-Verteidigung. Der Bauer auf d6 deckt den Bauern auf e5, sperrt aber den Läufer auf f8 ein.</p>
<p>3. d4 ♗g4</p>
<p>Eine verfrühte Fesselung des Springers auf f3. Üblich ist 3... exd4 4. ♘xd4 ♘f6.</p>
<p>4. dxe5 ♗xf3 5. ♕xf3 dxe5 6. ♗c4</p>
<p>Der Läufer auf c4 und die Dame auf f3 greifen gemeinsam das Feld f7 an: es droht Matt.</p>
<p>6... ♘f6 7. ♕b3</p>
<p>Ein Doppelangriff auf b7 und f7. Die Dame auf b3 und der Läufer auf c4 stehen auf derselben Diagonale a2-g8.</p>
<p>7... ♕e7 8. ♘c3</p>
<p>Weiß zieht die Entwicklung dem Bauerngewinn vor (8. ♕xb7 ♕b4+ 9. ♕xb4 ♗xb4+).</p>
<p>8... c6 9. ♗g5 b5</p>
<p>Der Springer auf f6 ist vom Läufer auf g5 gefesselt. Schwarz greift an, bevor er entwickelt ist.</p>
<p>10. ♘xb5</p>
<p>Das Opfer. Der Springer wird gegeben, um die Linien gegen den König in der Mitte zu öffnen.</p>
<p>10... cxb5 11. ♗xb5+ ♘bd7 12. O-O-O</p>
<p>Die lange Rochade bringt den Turm auf die d-Linie. Der Springer auf d7 ist vom Läufer auf b5 gefesselt.</p>
<p>12... ♖d8 13. ♖xd7 ♖xd7 14. ♖d1</p>
<p>Ein Qualitätsopfer, und der letzte Turm kommt ins Spiel. Alle weißen Figuren greifen an.</p>
<p>14... ♕e6 15. ♗xd7+ ♘xd7 16. ♕b8+</p>
<p>Das Damenopfer lenkt den Springer von d7 ab.</p>
<p>16... ♘xb8 17. ♖d8#</p>
<p>Matt. Der Turm auf d8 wird vom Läufer auf g5 gedeckt.</p>`,
}

const LEGAL_DE: DemoChapter = {
  title: 'Das Légal-Matt',
  plies: 13,
  html: `
<h2>Das Légal-Matt</h2>
<p><em>Légal de Kermeur — Saint Brie, Paris 1750</em></p>
<p>Die älteste Falle der Schachbücher: ein gefesselter Springer zieht trotzdem.</p>
<p>1. e4 e5 2. ♘f3 d6 3. ♗c4 ♗g4</p>
<p>Schwarz fesselt den Springer auf f3 an die Dame auf d1.</p>
<p>4. ♘c3 g6</p>
<p>Ein verlorener Zug. Schwarz musste sich mit 4... ♘f6 entwickeln.</p>
<p>5. ♘xe5</p>
<p>Der gefesselte Springer zieht und gibt die Dame her. Den Springer zu schlagen (5... dxe5 6. ♕xg4) kostet nur einen Bauern.</p>
<p>5... ♗xd1 6. ♗xf7+ ♔e7 7. ♘d5#</p>
<p>Matt mit drei Leichtfiguren: der Läufer auf f7 gibt Schach, die Springer auf d5 und e5 decken alle Fluchtfelder.</p>`,
}

const OPERA_EN_BOOK: DemoChapter = {
  title: 'The Opera Game',
  plies: 33,
  html: `
<h2>The Opera Game</h2>
<p><em>Paul Morphy — Duke of Brunswick and Count Isouard, Paris 1858</em></p>
<p>The most famous lesson on development: White brings every piece into play while Black loses time.</p>
<p>1. e4 e5 2. ♘f3 d6</p>
<p>The Philidor Defence. The pawn on d6 supports the pawn on e5 but shuts in the bishop on f8.</p>
<p>3. d4 ♗g4</p>
<p>A premature pin on the knight on f3. The usual line is 3... exd4 4. ♘xd4 ♘f6.</p>
<p>4. dxe5 ♗xf3 5. ♕xf3 dxe5 6. ♗c4</p>
<p>The bishop on c4 and the queen on f3 attack the square f7 together: mate is threatened.</p>
<p>6... ♘f6 7. ♕b3</p>
<p>A double attack on b7 and f7. The queen on b3 and the bishop on c4 stand on the diagonal a2-g8.</p>
<p>7... ♕e7 8. ♘c3</p>
<p>White prefers development to winning a pawn (8. ♕xb7 ♕b4+ 9. ♕xb4 ♗xb4+).</p>
<p>8... c6 9. ♗g5 b5</p>
<p>The knight on f6 is pinned by the bishop on g5. Black attacks before finishing development.</p>
<p>10. ♘xb5</p>
<p>The sacrifice. The knight is given up to open lines against the king in the centre.</p>
<p>10... cxb5 11. ♗xb5+ ♘bd7 12. O-O-O</p>
<p>Castling queenside puts the rook on the d-file. The knight on d7 is pinned by the bishop on b5.</p>
<p>12... ♖d8 13. ♖xd7 ♖xd7 14. ♖d1</p>
<p>An exchange sacrifice, and the last rook joins in. Every white piece is attacking.</p>
<p>14... ♕e6 15. ♗xd7+ ♘xd7 16. ♕b8+</p>
<p>The queen sacrifice deflects the knight from d7.</p>
<p>16... ♘xb8 17. ♖d8#</p>
<p>Mate. The rook on d8 is defended by the bishop on g5.</p>`,
}

/** The Opera Game with three misprints, to show wrong-move detection. */
const OPERA_WITH_ERRORS: DemoChapter = {
  title: 'La partida de la Ópera (con erratas)',
  plies: 33,
  misprints: [['Bf5', 'Bg4'], ['Bc5', 'Bc4'], ['Bg4', 'Bg5']],
  html: `
<h2>La partida de la Ópera, con erratas</h2>
<p><em>Paul Morphy — Duque de Brunswick y Conde Isouard, París 1858</em></p>
<p>Este texto tiene tres jugadas mal impresas. El lector las detecta porque dejan de ser legales —o hacen ilegal una jugada posterior— y propone la corrección con la que el resto de la partida vuelve a encajar. Aparecen subrayadas en rojo; el botón de errores las lista.</p>
<p>1. e4 e5 2. ♘f3 d6 3. d4 ♗f5</p>
<p>Primera errata: el texto dice ♗f5, que es legal. El error solo se descubre una jugada después, cuando el alfil «captura en f3».</p>
<p>4. dxe5 ♗xf3 5. ♕xf3 dxe5 6. ♗c5</p>
<p>Segunda errata: el alfil de f1 no puede llegar a c5.</p>
<p>6... ♘f6 7. ♕b3 ♕e7 8. ♘c3 c6 9. ♗g4 b5</p>
<p>Tercera errata: el alfil de c1 no llega a g4.</p>
<p>10. ♘xb5 cxb5 11. ♗xb5+ ♘bd7 12. O-O-O ♖d8 13. ♖xd7 ♖xd7 14. ♖d1 ♕e6 15. ♗xd7+ ♘xd7 16. ♕b8+ ♘xb8 17. ♖d8#</p>`,
}

export const DEMO_BOOKS: DemoBook[] = [
  {
    book: {
      id: 1,
      title: 'Partidas inmortales comentadas',
      author: 'Demo ChessReader',
      createdAt: '2026-11-16T10:00:00Z',
      description: 'Cinco partidas clásicas completas, comentadas jugada a jugada.',
    },
    chapters: [OPERA_ES, LEGAL_ES, IMMORTAL_ES, EVERGREEN_ES, CENTURY_ES],
  },
  {
    book: {
      id: 2,
      title: 'Annotated Classics',
      author: 'ChessReader demo',
      createdAt: '2026-11-16T10:00:00Z',
      description: 'Complete annotated games in English, book style and PGN style.',
    },
    chapters: [OPERA_EN_BOOK, LEGAL_EN, OPERA_EN],
  },
  {
    book: {
      id: 3,
      title: 'Detección de jugadas erróneas',
      author: 'Demo ChessReader',
      createdAt: '2026-11-16T10:00:00Z',
      description: 'Una partida con erratas: el lector las detecta y propone la corrección.',
    },
    chapters: [OPERA_WITH_ERRORS],
  },
  {
    book: {
      id: 4,
      title: 'Kommentierte Klassiker',
      author: 'ChessReader Demo',
      createdAt: '2026-11-16T10:00:00Z',
      description: 'Vollständige kommentierte Partien auf Deutsch.',
    },
    chapters: [OPERA_DE, LEGAL_DE],
  },
]

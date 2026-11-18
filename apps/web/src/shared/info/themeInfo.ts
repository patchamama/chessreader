import type { AppLanguage } from '../settings/settingsStore'

type Entry = Record<AppLanguage, [name: string, explanation: string]>

/**
 * Short explanations of the Lichess puzzle themes (the keys are Lichess's),
 * written to teach the pattern, in each language of the app.
 */
const THEMES: Record<string, Entry> = {
  fork: {
    en: ['Fork', 'One piece attacks two or more enemy pieces at once; the opponent can save only one of them. Knights and queens are the classic forkers.'],
    es: ['Ataque doble', 'Una pieza ataca dos o más piezas rivales a la vez y el rival solo puede salvar una. El caballo y la dama son los grandes especialistas.'],
    de: ['Gabel', 'Eine Figur greift zwei oder mehr gegnerische Figuren gleichzeitig an; der Gegner kann nur eine retten. Springer und Dame sind die klassischen Gabelfiguren.'],
  },
  pin: {
    en: ['Pin', 'A piece cannot move (or should not) because a more valuable piece, often the king, stands behind it on the same line.'],
    es: ['Clavada', 'Una pieza no puede (o no debe) moverse porque detrás, en la misma línea, hay otra más valiosa, a menudo el rey.'],
    de: ['Fesselung', 'Eine Figur kann (oder sollte) nicht ziehen, weil hinter ihr auf derselben Linie eine wertvollere Figur steht, oft der König.'],
  },
  skewer: {
    en: ['Skewer', 'A reversed pin: a valuable piece is attacked and, when it moves away, the piece behind it is lost.'],
    es: ['Enfilada', 'Una clavada al revés: se ataca una pieza valiosa y, cuando se aparta, se gana la que está detrás.'],
    de: ['Spieß', 'Eine umgekehrte Fesselung: eine wertvolle Figur wird angegriffen, und wenn sie ausweicht, geht die Figur dahinter verloren.'],
  },
  discoveredAttack: {
    en: ['Discovered attack', 'A piece moves out of the way and uncovers an attack by the piece behind it, so two threats appear in one move.'],
    es: ['Ataque a la descubierta', 'Una pieza se aparta y descubre el ataque de la que tiene detrás: con una sola jugada aparecen dos amenazas.'],
    de: ['Abzugsangriff', 'Eine Figur zieht weg und gibt den Angriff der Figur dahinter frei: mit einem Zug entstehen zwei Drohungen.'],
  },
  doubleCheck: {
    en: ['Double check', 'Two pieces give check at once. The only answer is to move the king, which makes it one of the strongest tactics.'],
    es: ['Jaque doble', 'Dos piezas dan jaque a la vez. La única defensa es mover el rey, por eso es una de las tácticas más fuertes.'],
    de: ['Doppelschach', 'Zwei Figuren geben gleichzeitig Schach. Nur ein Königszug hilft, deshalb ist es eine der stärksten Taktiken.'],
  },
  sacrifice: {
    en: ['Sacrifice', 'Material is given up on purpose to get something worth more: a mating attack, a decisive initiative or more material back.'],
    es: ['Sacrificio', 'Se entrega material a propósito para obtener algo de más valor: un ataque de mate, una iniciativa decisiva o recuperar más material.'],
    de: ['Opfer', 'Material wird absichtlich gegeben, um etwas Wertvolleres zu bekommen: einen Mattangriff, entscheidende Initiative oder mehr Material zurück.'],
  },
  exchangeSacrifice: {
    en: ['Exchange sacrifice', 'A rook is given for a bishop or knight, usually to break the opponent\'s position or win key squares.'],
    es: ['Sacrificio de calidad', 'Se entrega una torre por un alfil o un caballo, normalmente para romper la posición rival o ganar casillas clave.'],
    de: ['Qualitätsopfer', 'Ein Turm wird für Läufer oder Springer gegeben, meist um die gegnerische Stellung aufzubrechen oder Schlüsselfelder zu gewinnen.'],
  },
  mate: {
    en: ['Checkmate', 'The king is in check and has no way out: the game is over. Look for checks first, then captures, then threats.'],
    es: ['Jaque mate', 'El rey está en jaque y no tiene escapatoria: la partida termina. Busca primero los jaques, luego las capturas y después las amenazas.'],
    de: ['Schachmatt', 'Der König steht im Schach und kann nicht entkommen: die Partie ist vorbei. Suche zuerst Schachs, dann Schlagzüge, dann Drohungen.'],
  },
  mateIn1: {
    en: ['Mate in 1', 'One move gives checkmate. Check every check the position allows.'],
    es: ['Mate en 1', 'Una sola jugada da mate. Revisa todos los jaques posibles.'],
    de: ['Matt in 1', 'Ein Zug setzt matt. Prüfe jedes mögliche Schach.'],
  },
  mateIn2: {
    en: ['Mate in 2', 'Checkmate in two moves: the first move (often a check or a quiet move) leaves the opponent no defence.'],
    es: ['Mate en 2', 'Mate en dos jugadas: la primera (a menudo un jaque o una jugada tranquila) deja al rival sin defensa.'],
    de: ['Matt in 2', 'Matt in zwei Zügen: der erste Zug (oft ein Schach oder ein stiller Zug) lässt dem Gegner keine Verteidigung.'],
  },
  mateIn3: {
    en: ['Mate in 3', 'Checkmate in three moves. Calculate forcing moves — checks and captures — to the end.'],
    es: ['Mate en 3', 'Mate en tres jugadas. Calcula hasta el final las jugadas forzadas: jaques y capturas.'],
    de: ['Matt in 3', 'Matt in drei Zügen. Berechne die forcierenden Züge — Schachs und Schlagzüge — bis zum Ende.'],
  },
  mateThreat: {
    en: ['Mate threat', 'A move that threatens mate next, forcing the opponent to defend instead of carrying out their own plans.'],
    es: ['Amenaza de mate', 'Una jugada que amenaza mate a continuación y obliga al rival a defenderse en lugar de seguir con sus planes.'],
    de: ['Mattdrohung', 'Ein Zug, der im nächsten Zug Matt droht und den Gegner zur Verteidigung zwingt.'],
  },
  backRankMate: {
    en: ['Back-rank mate', 'A rook or queen mates the king on its first rank, trapped behind its own pawns. A "luft" pawn move prevents it.'],
    es: ['Mate del pasillo', 'Una torre o la dama dan mate al rey en su primera fila, encerrado por sus propios peones. Abrir una "salida" con un peón lo evita.'],
    de: ['Grundreihenmatt', 'Turm oder Dame setzen den König auf der Grundreihe matt, eingesperrt von den eigenen Bauern. Ein "Luftloch" verhindert es.'],
  },
  smotheredMate: {
    en: ['Smothered mate', 'A knight mates a king that is surrounded by its own pieces and cannot move.'],
    es: ['Mate ahogado', 'Un caballo da mate a un rey rodeado por sus propias piezas, que no puede moverse.'],
    de: ['Ersticktes Matt', 'Ein Springer setzt einen König matt, der von eigenen Figuren eingeschlossen ist.'],
  },
  hangingPiece: {
    en: ['Hanging piece', 'A piece is left undefended (or insufficiently defended) and can simply be taken.'],
    es: ['Pieza colgada', 'Una pieza queda sin defensa (o mal defendida) y se puede capturar sin más.'],
    de: ['Hängende Figur', 'Eine Figur ist ungedeckt (oder ungenügend gedeckt) und kann einfach geschlagen werden.'],
  },
  trappedPiece: {
    en: ['Trapped piece', 'A piece has no safe squares left and will be won.'],
    es: ['Pieza atrapada', 'Una pieza se queda sin casillas seguras y se pierde.'],
    de: ['Gefangene Figur', 'Eine Figur hat keine sicheren Felder mehr und geht verloren.'],
  },
  deflection: {
    en: ['Deflection', 'A defender is forced away from the square or piece it guards.'],
    es: ['Desviación', 'Se obliga a una pieza defensora a abandonar la casilla o la pieza que protege.'],
    de: ['Ablenkung', 'Ein Verteidiger wird gezwungen, das Feld oder die Figur, die er deckt, zu verlassen.'],
  },
  attraction: {
    en: ['Attraction', 'A piece, often the king, is lured to a square where a tactic works against it, usually by a sacrifice.'],
    es: ['Atracción', 'Se atrae una pieza, a menudo el rey, a una casilla donde una táctica funciona contra ella, normalmente con un sacrificio.'],
    de: ['Hinlenkung', 'Eine Figur, oft der König, wird meist durch ein Opfer auf ein Feld gelockt, auf dem eine Taktik gegen sie wirkt.'],
  },
  capturingDefender: {
    en: ['Remove the defender', 'Capture (or exchange) the piece that defends something, and what it defended falls.'],
    es: ['Eliminar al defensor', 'Se captura (o se cambia) la pieza que defiende algo, y lo defendido cae.'],
    de: ['Beseitigung des Verteidigers', 'Die verteidigende Figur wird geschlagen oder getauscht, und das Verteidigte fällt.'],
  },
  interference: {
    en: ['Interference', 'A piece is placed between an enemy piece and what it defends, cutting the line of defence.'],
    es: ['Interferencia', 'Se interpone una pieza entre una pieza rival y lo que defiende, cortando la línea de defensa.'],
    de: ['Unterbrechung', 'Eine Figur wird zwischen eine gegnerische Figur und das, was sie deckt, gestellt.'],
  },
  clearance: {
    en: ['Clearance', 'A piece moves away, often with tempo, to free a square or line for another piece.'],
    es: ['Despeje', 'Una pieza se aparta, a menudo con tempo, para liberar una casilla o una línea para otra pieza.'],
    de: ['Räumung', 'Eine Figur zieht, oft mit Tempo, weg, um ein Feld oder eine Linie für eine andere Figur freizumachen.'],
  },
  xRayAttack: {
    en: ['X-ray attack', 'A piece attacks or defends a square through an enemy piece standing on the same line.'],
    es: ['Rayos X', 'Una pieza ataca o defiende una casilla a través de una pieza rival situada en la misma línea.'],
    de: ['Röntgenangriff', 'Eine Figur greift ein Feld durch eine gegnerische Figur auf derselben Linie hindurch an oder deckt es.'],
  },
  intermezzo: {
    en: ['Intermezzo', 'Instead of the expected move (often a recapture), an in-between move with a stronger threat is played first.'],
    es: ['Jugada intermedia', 'En lugar de la jugada esperada (a menudo una recaptura) se intercala antes otra con una amenaza mayor.'],
    de: ['Zwischenzug', 'Statt des erwarteten Zuges (oft ein Zurückschlagen) wird zuerst ein Zug mit stärkerer Drohung eingeschoben.'],
  },
  quietMove: {
    en: ['Quiet move', 'A move without check or capture that sets up an unstoppable threat.'],
    es: ['Jugada tranquila', 'Una jugada sin jaque ni captura que prepara una amenaza imparable.'],
    de: ['Stiller Zug', 'Ein Zug ohne Schach oder Schlagen, der eine unaufhaltsame Drohung vorbereitet.'],
  },
  zugzwang: {
    en: ['Zugzwang', 'The side to move would like to pass: every legal move makes its position worse.'],
    es: ['Zugzwang', 'El bando que juega preferiría pasar: cualquier jugada legal empeora su posición.'],
    de: ['Zugzwang', 'Die Seite am Zug würde gern passen: jeder legale Zug verschlechtert ihre Stellung.'],
  },
  promotion: {
    en: ['Promotion', 'A pawn reaches the last rank and becomes a queen (or another piece).'],
    es: ['Coronación', 'Un peón llega a la última fila y se convierte en dama (u otra pieza).'],
    de: ['Umwandlung', 'Ein Bauer erreicht die letzte Reihe und wird zur Dame (oder einer anderen Figur).'],
  },
  underPromotion: {
    en: ['Underpromotion', 'A pawn promotes to a knight, bishop or rook instead of a queen, to give check, avoid stalemate or win.'],
    es: ['Subpromoción', 'Un peón corona caballo, alfil o torre en vez de dama, para dar jaque, evitar el ahogado o ganar.'],
    de: ['Unterverwandlung', 'Ein Bauer wird statt zur Dame zu Springer, Läufer oder Turm, um Schach zu geben, Patt zu vermeiden oder zu gewinnen.'],
  },
  advancedPawn: {
    en: ['Advanced pawn', 'A pawn deep in the opponent\'s half is about to promote or ties the opponent down.'],
    es: ['Peón avanzado', 'Un peón muy adentrado en el campo rival está a punto de coronar o ata al rival.'],
    de: ['Vorgerückter Bauer', 'Ein weit vorgerückter Bauer steht kurz vor der Umwandlung oder bindet den Gegner.'],
  },
  enPassant: {
    en: ['En passant', 'A pawn that has just advanced two squares can be captured as if it had moved only one — on the very next move only.'],
    es: ['Al paso', 'Un peón que acaba de avanzar dos casillas puede capturarse como si hubiera avanzado una, solo en la jugada siguiente.'],
    de: ['En passant', 'Ein Bauer, der gerade zwei Felder vorgerückt ist, kann wie nach einem Feld geschlagen werden — nur im direkt folgenden Zug.'],
  },
  exposedKing: {
    en: ['Exposed king', 'The king has lost its pawn shelter or defenders and becomes a target.'],
    es: ['Rey expuesto', 'El rey ha perdido su protección de peones o defensores y se convierte en objetivo.'],
    de: ['Ungeschützter König', 'Der König hat seine Bauerndeckung oder Verteidiger verloren und wird zum Ziel.'],
  },
  kingsideAttack: {
    en: ['Kingside attack', 'An attack against the king castled on the kingside.'],
    es: ['Ataque al flanco de rey', 'Un ataque contra el rey enrocado en el flanco de rey.'],
    de: ['Königsangriff', 'Ein Angriff gegen den kurz rochierten König.'],
  },
  queensideAttack: {
    en: ['Queenside attack', 'An attack against the king castled on the queenside.'],
    es: ['Ataque al flanco de dama', 'Un ataque contra el rey enrocado en el flanco de dama.'],
    de: ['Damenflügelangriff', 'Ein Angriff gegen den lang rochierten König.'],
  },
  defensiveMove: {
    en: ['Defensive move', 'The right move here prevents the opponent\'s threat instead of attacking.'],
    es: ['Jugada defensiva', 'La jugada correcta aquí impide la amenaza del rival en vez de atacar.'],
    de: ['Verteidigungszug', 'Der richtige Zug verhindert hier die gegnerische Drohung, statt anzugreifen.'],
  },
  castling: {
    en: ['Castling', 'The king and a rook move together: the king gets safe and the rook comes into play.'],
    es: ['Enroque', 'El rey y una torre se mueven a la vez: el rey queda a salvo y la torre entra en juego.'],
    de: ['Rochade', 'König und Turm ziehen zusammen: der König steht sicher und der Turm kommt ins Spiel.'],
  },
}

/** Lichess keys of the theme names the app writes (lichessThemes) and other spellings. */
const ALIASES: Record<string, string> = { 'discovered-check': 'discoveredAttack', checkmate: 'mate', 'en passant': 'enPassant' }

/** Themes that are not Lichess puzzle themes (no training page there). */
const NOT_ON_LICHESS = new Set(['exchangeSacrifice', 'mateThreat'])

const norm = (s: string) => s.trim().toLowerCase()

/** The name and explanation of a pattern, by its Lichess key or by its name in any language. */
export function themeInfo(theme: string, lang: AppLanguage): { key: string; name: string; text: string; lichess: boolean } | null {
  const n = norm(theme)
  const key = THEMES[theme] ? theme
    : ALIASES[n] ?? Object.keys(THEMES).find((k) => norm(k) === n || Object.values(THEMES[k]).some(([name]) => norm(name) === n))
  if (!key || !THEMES[key]) return null
  const [name, text] = THEMES[key][lang] ?? THEMES[key].en
  return { key, name, text, lichess: !NOT_ON_LICHESS.has(key) }
}

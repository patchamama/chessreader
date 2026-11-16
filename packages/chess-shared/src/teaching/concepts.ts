/**
 * Glossary of the chess concepts a commentary may name. When a comment mentions
 * one, the reader offers its short definition, so a learner can look it up at
 * the moment it comes up in the game.
 */

export type Lang = 'es' | 'en' | 'de';

export interface Concept {
  id: string;
  title: Record<Lang, string>;
  definition: Record<Lang, string>;
  /** Regex source per language (matched case-insensitively on word starts). */
  patterns: Record<Lang, string>;
}

const c = (
  id: string,
  es: [string, string, string],
  en: [string, string, string],
  de: [string, string, string],
): Concept => ({
  id,
  title: { es: es[0], en: en[0], de: de[0] },
  patterns: { es: es[1], en: en[1], de: de[1] },
  definition: { es: es[2], en: en[2], de: de[2] },
});

export const CONCEPTS: Concept[] = [
  c('pin',
    ['Clavada', 'clavad[ao]s?|clava(?:r|ndo)?\\b|desclava', 'Una pieza no puede (o no le conviene) moverse porque dejaría expuesta a otra pieza más valiosa que está detrás de ella en la misma línea.'],
    ['Pin', 'pin(?:s|ned|ning)?\\b|unpin', 'A piece cannot (or should not) move because it would expose a more valuable piece standing behind it on the same line.'],
    ['Fesselung', 'fesselung|gefesselt|fessel[nt]\\b|entfessel', 'Eine Figur kann (oder sollte) nicht ziehen, weil sonst eine wertvollere Figur dahinter auf derselben Linie angegriffen wäre.']),
  c('double-attack',
    ['Ataque doble', 'ataque doble|doble ataque|horquilla', 'Una sola pieza ataca a la vez dos objetivos; el rival solo puede defender uno.'],
    ['Double attack', 'double attack|fork(?:s|ed|ing)?\\b', 'One piece attacks two targets at once; the opponent can only save one.'],
    ['Doppelangriff', 'doppelangriff|gabel', 'Eine einzige Figur greift zwei Ziele zugleich an; der Gegner kann nur eines retten.']),
  c('discovered-check',
    ['Jaque a la descubierta', 'jaques? (?:a la )?descubiert[ao]|descubierta', 'Una pieza se mueve y descubre el jaque de otra pieza que estaba detrás.'],
    ['Discovered check', 'discovered (?:check|attack)', 'A piece moves away and uncovers a check from the piece behind it.'],
    ['Abzugsschach', 'abzugsschach|abzugsangriff|abzug\\b', 'Eine Figur zieht weg und öffnet das Schach der dahinter stehenden Figur.']),
  c('double-check',
    ['Jaque doble', 'jaque doble|doble jaque', 'Dos piezas dan jaque a la vez. El rey está obligado a moverse.'],
    ['Double check', 'double check', 'Two pieces give check at once. The king has to move.'],
    ['Doppelschach', 'doppelschach', 'Zwei Figuren geben gleichzeitig Schach. Der König muss ziehen.']),
  c('skewer',
    ['Enfilada', 'enfilada', 'Ataque sobre una pieza valiosa que, al apartarse, deja capturar a la que tiene detrás.'],
    ['Skewer', 'skewer(?:s|ed)?\\b', 'An attack on a valuable piece which, when it moves away, exposes the piece behind it.'],
    ['Spieß', 'spie(?:ß|ss)', 'Angriff auf eine wertvolle Figur, die beim Wegziehen die Figur dahinter preisgibt.']),
  c('x-ray',
    ['Rayos X', 'rayos? ?x', 'Una pieza de largo alcance actúa a través de otra pieza que está en su línea.'],
    ['X-ray', 'x-?ray', 'A long-range piece exerts its power through another piece standing on its line.'],
    ['Röntgenangriff', 'rontgen\\w*', 'Eine langschrittige Figur wirkt durch eine andere Figur auf ihrer Linie hindurch.']),
  c('en-passant',
    ['Captura al paso', 'al paso|en passant', 'Un peón captura a un peón rival que acaba de avanzar dos casillas, como si solo hubiera avanzado una.'],
    ['En passant', 'en passant', 'A pawn captures an enemy pawn that has just advanced two squares, as if it had advanced only one.'],
    ['Schlagen en passant', 'en passant|im vorbeigehen', 'Ein Bauer schlägt einen gegnerischen Bauern, der gerade zwei Felder vorgerückt ist, als wäre er nur eines gezogen.']),
  c('gambit',
    ['Gambito', 'gambito', 'Entrega de material —normalmente un peón— en la apertura a cambio de desarrollo, centro o ataque.'],
    ['Gambit', 'gambit', 'An opening offer of material — usually a pawn — in return for development, the centre or an attack.'],
    ['Gambit', 'gambit', 'Materialopfer in der Eröffnung – meist ein Bauer – für Entwicklung, Zentrum oder Angriff.']),
  c('trap',
    ['Celada', 'celada|trampa', 'Una jugada que invita al rival a un error que parece natural.'],
    ['Trap', 'trap(?:s|ped)?\\b', 'A move that invites the opponent into a natural-looking mistake.'],
    ['Falle', 'falle\\b|fallen\\b', 'Ein Zug, der den Gegner zu einem natürlich aussehenden Fehler einlädt.']),
  c('sacrifice',
    ['Sacrificio', 'sacrifici[oa]|sacrific(?:a|an|ó)\\b|entrega', 'Entregar material voluntariamente para lograr una ventaja mayor: ataque, mate o posición.'],
    ['Sacrifice', 'sacrific(?:e|es|ed|ing)', 'Giving up material on purpose for a greater gain: an attack, mate or position.'],
    ['Opfer', 'opfer\\w*|geopfert', 'Freiwillige Materialabgabe für einen größeren Vorteil: Angriff, Matt oder Stellung.']),
  c('weak-square',
    ['Casilla débil', 'casillas? débil(?:es)?|debilidad|agujero', 'Una casilla que ya no puede ser defendida por peones propios y que el rival puede ocupar con una pieza.'],
    ['Weak square', 'weak squares?|weakness|hole\\b', 'A square that can no longer be defended by one\'s own pawns, which the opponent can occupy with a piece.'],
    ['Schwaches Feld', 'schwache[sn]? feld(?:er)?|schwache|loch\\b', 'Ein Feld, das nicht mehr von eigenen Bauern gedeckt werden kann und das der Gegner mit einer Figur besetzen kann.']),
  c('bad-bishop',
    ['Alfil malo', 'alfil malo', 'Un alfil bloqueado por sus propios peones, que están en casillas de su mismo color.'],
    ['Bad bishop', 'bad bishop', 'A bishop hemmed in by its own pawns standing on squares of its colour.'],
    ['Schlechter Läufer', 'schlechte[rn]? laufer', 'Ein Läufer, der von den eigenen Bauern auf Feldern seiner Farbe eingeengt wird.']),
  c('passed-pawn',
    ['Peón pasado', 'peon(?:es)? pasados?|peon(?:es)? libres?', 'Un peón que no tiene peones rivales delante, ni en su columna ni en las vecinas.'],
    ['Passed pawn', 'passed pawns?', 'A pawn with no enemy pawns ahead of it on its own or the neighbouring files.'],
    ['Freibauer', 'freibauern?', 'Ein Bauer ohne gegnerische Bauern vor sich, weder auf seiner noch auf den Nachbarlinien.']),
  c('isolated-pawn',
    ['Peón aislado', 'peon(?:es)? aislados?', 'Un peón sin peones propios en las columnas vecinas: nadie puede defenderlo con otro peón.'],
    ['Isolated pawn', 'isolated pawns?|isolani', 'A pawn with no friendly pawns on the neighbouring files: no pawn can defend it.'],
    ['Isolierter Bauer', 'isolierte[rn]? bauern?|isolani', 'Ein Bauer ohne eigene Bauern auf den Nachbarlinien: kein Bauer kann ihn decken.']),
  c('doubled-pawns',
    ['Peones doblados', 'peon(?:es)? doblados?', 'Dos peones del mismo bando en la misma columna.'],
    ['Doubled pawns', 'doubled pawns?', 'Two pawns of the same side on the same file.'],
    ['Doppelbauer', 'doppelbauern?', 'Zwei Bauern derselben Partei auf derselben Linie.']),
  c('connected-pawns',
    ['Peones ligados', 'peon(?:es)? (?:ligados?|unidos?|contiguos?|continuos?)', 'Peones en columnas vecinas que pueden defenderse entre sí.'],
    ['Connected pawns', 'connected pawns?', 'Pawns on neighbouring files that can defend each other.'],
    ['Verbundene Bauern', 'verbundene[n]? bauern', 'Bauern auf benachbarten Linien, die einander decken können.']),
  c('backward-pawn',
    ['Peón retrasado', 'peon(?:es)? (?:retrasados?|rezagados?|rechazados?)', 'Un peón que quedó detrás de sus compañeros y no puede avanzar sin perderse.'],
    ['Backward pawn', 'backward pawns?', 'A pawn left behind its neighbours that cannot advance safely.'],
    ['Rückständiger Bauer', 'ruckstandige[rn]? bauern?', 'Ein Bauer, der hinter seinen Nachbarn zurückgeblieben ist und nicht sicher vorrücken kann.']),
  c('castling',
    ['Enroque', 'enro(?:que|ca|car|cado)s?', 'Jugada especial de rey y torre a la vez: el rey se pone a salvo y la torre entra en juego.'],
    ['Castling', 'castl(?:e|es|ed|ing)', 'A special move of king and rook together: the king reaches safety and the rook comes into play.'],
    ['Rochade', 'rochade|rochier\\w*', 'Sonderzug von König und Turm zugleich: der König kommt in Sicherheit, der Turm ins Spiel.']),
  c('smothered-mate',
    ['Mate ahogado', 'mate ahogado|mate de la coz', 'Mate de caballo a un rey encerrado por sus propias piezas.'],
    ['Smothered mate', 'smothered mate', 'A knight mates a king hemmed in by its own pieces.'],
    ['Ersticktes Matt', 'erstickte[sn]? matt', 'Ein Springer setzt einen König matt, der von eigenen Figuren eingeschlossen ist.']),
  c('windmill',
    ['Molino', 'molino', 'Serie de jaques a la descubierta que permite capturar material jugada tras jugada.'],
    ['Windmill', 'windmill', 'A series of discovered checks that wins material move after move.'],
    ['Zwickmühle', 'zwickmuhle', 'Eine Serie von Abzugsschachs, die Zug um Zug Material gewinnt.']),
  c('development',
    ['Desarrollo', 'desarroll[oa]\\w*', 'Sacar las piezas de sus casillas iniciales hacia casillas activas.'],
    ['Development', 'develop\\w*', 'Bringing the pieces from their starting squares to active ones.'],
    ['Entwicklung', 'entwick\\w*', 'Die Figuren von ihren Ausgangsfeldern auf aktive Felder bringen.']),
  c('open-file',
    ['Columna abierta', 'columna (?:abierta|semiabierta)|abr(?:e|ir) la columna', 'Una columna sin peones: el camino natural de las torres.'],
    ['Open file', '(?:half-)?open file', 'A file with no pawns on it: the natural road for the rooks.'],
    ['Offene Linie', '(?:halb)?offene[n]? linie', 'Eine Linie ohne Bauern: der natürliche Weg der Türme.']),
  c('blockade',
    ['Bloqueo', 'bloque[oa]\\w*', 'Colocar una pieza delante de un peón rival —o en una línea— para detenerlo.'],
    ['Blockade', 'blockad\\w*', 'Placing a piece in front of an enemy pawn — or on a line — to stop it.'],
    ['Blockade', 'blockade|blockier\\w*', 'Eine Figur vor einen gegnerischen Bauern – oder auf eine Linie – stellen, um ihn aufzuhalten.']),
  c('deflection',
    ['Desviación', 'desvia\\w*|desvío', 'Obligar a una pieza a abandonar la casilla o la línea que defiende.'],
    ['Deflection', 'deflect\\w*', 'Forcing a piece away from the square or line it defends.'],
    ['Ablenkung', 'ablenk\\w*|abgelenkt', 'Eine Figur von dem Feld oder der Linie weglocken, die sie verteidigt.']),
  c('zugzwang',
    ['Zugzwang', 'zugzwang', 'Estar obligado a mover cuando cualquier jugada empeora la posición.'],
    ['Zugzwang', 'zugzwang', 'Being compelled to move when every move makes the position worse.'],
    ['Zugzwang', 'zugzwang', 'Ziehen müssen, obwohl jeder Zug die Stellung verschlechtert.']),
];

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface ConceptHit extends Concept {
  /** Offset of the mention in the text. */
  start: number;
  end: number;
}

/** Concepts named in `text`, in the order they are mentioned (each one once). */
export function findConcepts(text: string): ConceptHit[] {
  // Accent-insensitive matching on a same-length normalised copy.
  const plain = [...text].map((ch) => (strip(ch) || ch).slice(0, 1)).join('').toLowerCase();
  const hits: ConceptHit[] = [];
  for (const concept of CONCEPTS) {
    let best: { start: number; end: number } | null = null;
    for (const lang of ['es', 'en', 'de'] as const) {
      const re = new RegExp(`(?<![a-z])(?:${strip(concept.patterns[lang])})`, 'i');
      const m = re.exec(plain);
      if (m && (!best || m.index < best.start)) best = { start: m.index, end: m.index + m[0].length };
    }
    if (best) hits.push({ ...concept, ...best });
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** Which language a commentary is written in (Spanish unless clearly English). */
export function detectLang(text: string): Lang {
  const words = strip(text).split(/[^a-z]+/);
  const count = (list: string[]) => words.filter((w) => list.includes(w)).length;
  const es = count(['el', 'la', 'los', 'las', 'de', 'que', 'es', 'con', 'por', 'una', 'un', 'en', 'y', 'su']);
  const en = count(['the', 'of', 'and', 'is', 'with', 'to', 'on', 'his', 'that', 'it']);
  const de = count(['der', 'die', 'das', 'und', 'ist', 'mit', 'auf', 'den', 'nicht', 'ein', 'eine', 'zu', 'von']);
  return de > es && de > en ? 'de' : en > es ? 'en' : 'es';
}

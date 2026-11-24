# ai-narration-guides
Objective: AI narration guides (compact actions) shown only in debug mode and reviewable, generated paragraph by paragraph from the AI menu with footer progress; a Settings modal with every AI prompt; AI commentary of the engine's key moments with material/sacrifice facts. Branch: main (work-unit commits + tag). Delivery: ask-on-risk. Runners: Vitest (apps/web, packages/chess-shared), PHPUnit (apps/api); tsc + eslint last.

## Specs
- S1 "no se visualicen por defecto las acciones en lenguaje compacto, a no ser que se encuentre en modo debug (en local por defecto activado y en deploy desactivada esta opción, así que poner botón que permita activar este en todo el documento para que se muestre / oculte)"
- S2 "al analizar el documento con la IA, debe de párrafo a párrafo tener toda la información necesaria para generar la guía en lenguaje compacto que le ayude al narrador después a mostrar lo mejor posible lo comentado en el párrafo, cada uno de estas pautas o acciones en formato compacto deben de mostrarse también resaltado como se mostraría con el narrador en el board de análisis, así como mostrar si es posible en el texto del comentario en el momento en que se visualiza esa acción de la narración del narrador, para así poder revisar sí está bien."
- S3 "En el botón de la IA de la app que está arriba del tablero de análisis, al pulsarse debe de mostrarse la opción de generar guías en los comentarios o algo así que permita ejecutar esa acción de análisis párrafo por párrafo por la IA y debe de mostrarse en el footer en la barra de estado una barra de progreso que muestre el avance."
- S4 "En settings poner un apartado que permita ver en un modal todos los prompts existentes para cada situación relacionados con la IA."
- S5 "Una de las acciones de la IA es generar comentarios que es otra acción que determinaría encontrar con la ayuda del motor los momentos claves de la partida (que parece que ya hace bien y genera el diagrama) pero después comentar con la IA esos momentos teniendo en cuenta las posibles líneas que muestra el motor de evaluación y lo que sucede después en la partida que permita desvelar posibles planes que pueden terminar en mate, captura y ganancia de piezas que eso perfectamente se puede detectar haciendo el calculo de piezas de cada bando en cada momento del juego y la ganancia o perdida de piezas, pero también hay que revisar pues puede ser que puede haber pérdida de piezas y sin embargo una evaluación mejor de la posición del juego mucho mejor, ante un sacrificio de piezas que puede determinar mejores opciones de ataque u otras jugadas"

## Tasks
- [x] T1 S1 S2 S3 debug display + paragraph-by-paragraph guide generation + AI menu — writer F
- [x] T2 S4 prompt catalog modal in Settings — writer G
- [x] T3 S5 AI key-moment commentary with material/sacrifice facts — writer H (parent wires it into the AI menu)

## Log
- L1 2026-11-24 user: (the message; the specs quote its exact strings)

- L2 2026-11-24 user: sacrifices are judged over the whole exchange group (start vs end material and evaluation), with the piece offered "to the slaughter", exchange/queen sacrifices, forced moves and zugzwang. Done in v0.146.1 (momentFacts.ts group logic).

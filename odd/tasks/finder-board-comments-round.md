# finder-board-comments-round
Objective: footer GPU check, analysis-board tabs for opened games/books, quote-preserving universal prompt, richer "Find by position", comments shown/edited per FEN in Analysis board and Play. Branch: main (work-unit commits + tag). Delivery: ask-on-risk. Runners: Vitest (apps/web, packages/chess-shared scripts). tsc + eslint last. Dev stack: web http://127.0.0.1:5180, API :8090.

## Specs
- S1 "probemos el footer de la GPU en el navegador"
- S2 "siempre que se abra una partida o un libro, debe de abrirse en el "Analysis board" en un tab, así al irse en cualquier momento a ese apartado, aparecerían ahí las partidas, libros, abiertos."
- S3 "Mejora el prompt de Universal text, que no se eliminen las citas, estas se pueden traducir pero no eliminar la cita en sí, y quien lo dijo."
- S4 "En "Comments" en "Find by position" poner botón que permita poner un board y así también mientras se van haciendo jugadas, que se vayan poniendo los resultados de los fen encontrados para cada jugada o configuración del tablero y que cumplan con los filtros que aparecen abajo, así que se recomienden o pongan como recomendación también el png de las aparturas más comunes y también las celadas para probar reproducirlas aquí junto con los comentarios."
- S5 "en el análisis board pon una opción que permita que mientras se juega o reproduce un juego, se puedan ver los comentarios existentes para cada fen usando preferiblemente el idioma configurado en el tablero y si no hay en ese idioma en inglés, con la opción de editar siempre cada comentario, saliendo como en detalles en el apartado de comentarios el editor. Esa opción también deseo que se pueda mostrar en Play si se desea que se vayan mostrando los comentarios."
- S6 "En Comments cuando se filtre por un png, tablero o fen, los comentarios filtrados deben de permitir editarse (y que aparezca la edición como lo que aparece en details)."
- S7 "Si se pone una notación png como esta: 1 e4 e5 2 Cf3, debe de convertirse automáticamente a 1. e4 e5 2. Cf3, así que se hagan correcciones si es posible y si en alguna jugada no se reconoce, que se digan los caracteres irreconocibles y que se ponga una ayuda de las jugadas más frecuentes representadas en un png como enroque, captura, coronación de un peón en dama, y que se reconozca en inglés, español y alemán por defecto así como símbolos, pudiendose elegir el idioma de la partida pero por defecto que esté en auto con autoreconocimiento ..., adicionalmente que se ponga en las jugadas reconocidas la opción si se desea de mostrarse en un tablero."
- S8 "Si se pone algo así: 1. e4 e5 2. Nf3 NC6 por ejemplo, debe de reconcerse como 1. e4 e5 2. Nf3 Nc6."
- S9 "Al filtrarse los comentarios para una posición debe de mostrarse cuántos comentarios se encontraron."

## Tasks
- [x] T1 S1 footer GPU in browser — parent
- [x] T2 S3 universal prompt keeps quotes and authors — parent (scripts/translate-comments.mjs)
- [x] T3 S4 S6 S7 S8 S9 Find by position + editable filtered comments — writer W1 (features/database/*)
- [x] T4 S5 comments per FEN in Analysis board and Play — writer W2
- [x] T5 S2 analysis tab per opened game/book — writer W3

## Log
- L1 2026-11-20 user: S1-S9 (quoted above), one message.

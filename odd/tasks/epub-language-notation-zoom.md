# epub-language-notation-zoom
Objective: language of each EPUB (filter + label in the library), recognition of the English "Garry Kasparov on My Great Predecessors" notation and its false positives, a zoom for the reader's text. Branch: main (work-unit commits + tag). Delivery: ask-on-risk. Runners: Vitest (apps/web, packages/chess-shared), PHPUnit (apps/api); tsc + eslint last. Dev stack: the console uses :8777; the app dev servers are web :5180 / API :8090 when started.

## Specs
- S1 "agrega a library la opción de filtrar por idioma los epub y en cada libro pon el idioma en que se encuentra el mismo."
- S2 "he agregado 4 libros "Garry Kasparov on My Great Predecessors, Part 1", así part 2, 3, 4 y 5 y no se reconoce en el regex o las jugadas su formato, que es algo como esto: 1 e4 e5 2 f4 f5?! 3 exf5 Qh4+ 4 g3 Qe7 5 Qh5+?! (5 fxe5! Qxe5+ 6 Qe2 is better) 5 ... Kd8 6 fxe5 Qxe5+ 7 Be2 (7 Qe2! Qxf5 8 Bh3) 7 ... Nf6 8 Qf3 d5 9 g4? h5! 10 h3? hxg4" (library books 18–22 of the dev database).
- S3 "adicionalmente pon en el visor del texto del libro, solo para esta parte una opción que se pueda hacer un zoom in o out."
- S4 "Y revisa pues está reconociendo letras como partes de las jugadas, como aquí: Fourth match, London 1834, 16th game / Sicilian Defence B32."

## Tasks
- [x] T1 S1 EPUB language: API (migration, ingestion, listing, backfill) + library filter and label — delegated
- [x] T2 S3 reader zoom for the book text — delegated
- [x] T3 S2 S4 recognition of the English notation and false positives — parent (diagnosis on the real chapters first)

## Log
- L1 2026-11-21 user (verbatim): "agrega a library la opción de filtrar por idioma los epub y en cada libro pon el idioma en que se encuentra el mismo. Por otro lado, he agregado 4 libros "Garry Kasparov on My Great Predecessors, Part 1", así part 2, 3, 4 y 5 y no se reconoce en el regex o las jugadas su formato, que es algo como esto: 1 e4 e5 2 f4 f5?! 3 exf5 Qh4+ 4 g3 Qe7 5 Qh5+?! (5 fxe5! Qxe5+ 6 Qe2 is better) 5 ... Kd8 6 fxe5 Qxe5+ 7 Be2 (7 Qe2! Qxf5 8 Bh3) 7 ... Nf6 8 Qf3 d5 9 g4? h5! 10 h3? hxg4, adicionalmente pon en el visor del texto del libro, solo para esta parte una opción que se pueda hacer un zoom in o out. Y revisa pues está reconociendo letras como partes de las jugadas, como aquí: Fourth match, London 1834, 16th game  Sicilian Defence B32."
- L2 Parent diagnosis (books 18-22): (a) "5 ... Kd8" (space before the dots) was not a move number, so Black's moves after it were lost: fixed in sanTokenizer (4.3x more main-line plies on the 5 books: 7,765 -> 33,217); (b) the letters painted as moves came from the chapter's `<title>` (47 characters) living in the live DOM but not in the recognition text, shifting every offset: `<head>`/`<title>` are now skipped by extractProseText. Verified in the browser on book 22 chapter 6: 1,510 of 1,559 move spans on their own text (the rest are "0-0" castling shown as written).


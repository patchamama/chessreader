import type { Book, Chapter } from '../features/library/api/libraryApi'
import { DEMO_BOOKS } from './demoGames'
import type { ParsedWebpage } from '../features/webparser/api/webparserApi'

export const MOCK_BOOKS: Book[] = DEMO_BOOKS.map((d) => d.book)

/** Chapters of every demo book, in reading order (chapter N = index N-1). */
export const MOCK_CHAPTERS: Record<number, Chapter[]> = Object.fromEntries(
  DEMO_BOOKS.map((d) => [
    d.book.id,
    d.chapters.map((c) => ({
      title: c.title,
      html: c.html,
      toc: d.chapters.map((x, i) => ({ order: i + 1, title: x.title })),
    })),
  ]),
)

// Webparser mock — simulates parsing a famous chess blog post
export const MOCK_PARSED_WEBPAGE: ParsedWebpage = {
  html: `
<article>
  <h1>Kasparov vs. Karpov — The Match of the Century (1985)</h1>
  <p>
    Game 16 of the 1985 World Chess Championship match between Garry Kasparov and Anatoly Karpov
    is considered one of the greatest games ever played. Kasparov, playing Black in a Sicilian Defence,
    unleashed a spectacular queen sacrifice.
  </p>
  <img src="https://demo.chessreader.app/diagrams/kasparov_karpov_1985.png" alt="Position after 17...Nd4" />
  <p>
    The critical position arises after White's 17th move. Kasparov played
    1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nc6 5. Nb5 d6 6. c4 Nf6 7. N1c3 a6
    8. Na3 d5 9. cxd5 exd5 10. exd5 Nb4 11. Be2 Bc5 12. O-O O-O 13. Bf3 Bf5
    14. Bg5 Re8 15. Qd2 b5 16. Rad1 Nd3 17. Nab1 h6 18. Bh4 b4 19. Na4 Bd6
    20. Bg3 Rc8 21. b3 g5 22. Bxd6 Qxd6 23. g3 Nd7 24. Bg2 Qf4 25. Qe2 Nxf2
    26. Rxf2 Rxe2 27. Rxe2 Be4 28. Rxe4 Qxe4 and Black eventually won.
  </p>
  <p>
    For comparison, here is a simpler but elegant miniature:
    1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6
    7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O
    Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#.
  </p>
  <img src="https://demo.chessreader.app/diagrams/morphy_opera.png" alt="The Opera Game final position" />
  <p>
    The Opera Game by Paul Morphy (1858) — played blindfolded during an opera performance — remains
    one of the most instructive examples of development and piece coordination ever recorded.
  </p>
</article>`,
  games: [],   // populated at runtime by the handler (games are extracted from html text)
  images: [
    {
      src: 'https://demo.chessreader.app/diagrams/kasparov_karpov_1985.png',
      alt: 'Position after 17...Nd4',
    },
    {
      src: 'https://demo.chessreader.app/diagrams/morphy_opera.png',
      alt: 'The Opera Game final position',
    },
  ],
}

export const MOCK_PENDING_USERS = [
  { id: 10, email: 'student1@example.com', status: 'pending' },
  { id: 11, email: 'coach@chessclub.org', status: 'pending' },
  { id: 12, email: 'reader@mail.com', status: 'pending' },
]

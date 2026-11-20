<?php

declare(strict_types=1);

namespace App\Application\Comments\Port;

/** The human commentary database: what authors said about a position. */
interface PositionCommentStore
{
    /**
     * Comments on a position (by its 16-hex hash and its key: FEN without move
     * counters), books before Lichess studies.
     *
     * @return list<array{id: int, text: string, lang: string, ply: int, san: string, game: array{id: string, label: ?string}, source: array{title: string, author: ?string, kind: string}}>
     */
    public function forPosition(string $hash, string $key, int $limit): array;

    /** @return array{id: string, label: ?string, white: ?string, black: ?string, pgn: string, source: array{title: string, author: ?string, kind: string}}|null */
    public function game(string $id): ?array;

    /**
     * A page of every comment, oldest first, with its source and game. Filters:
     * `q` (text contains, literally), `source` (source id), `lang`, `kind` ('book' | 'lichess').
     * `fen` is the stored position (FEN without move counters) completed with " 0 1".
     *
     * @param array{q?: string, source?: int, lang?: string, kind?: string} $filters
     * @return array{total: int, comments: list<array<string, mixed>>}
     */
    public function list(array $filters, int $offset, int $limit): array;

    /** @return list<array{id: int, title: string, author: ?string, kind: string, lang: string, book: ?string, comments: int}> */
    public function sources(): array;
}

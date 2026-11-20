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
     * `q` (text contains, literally), `source` (source id), `lang`, `kind` ('book' | 'lichess'), `hidden` (true: only the hidden comments; default only the visible).
     * `fen` is the stored position (FEN without move counters) completed with " 0 1".
     *
     * @param array{q?: string, source?: int, lang?: string, kind?: string, hidden?: bool} $filters
     * @return array{total: int, comments: list<array<string, mixed>>}
     */
    public function list(array $filters, int $offset, int $limit): array;

    /** @return list<array{id: int, title: string, author: ?string, kind: string, lang: string, book: ?string, comments: int}> */
    public function sources(): array;

    /**
     * Hides a comment (idempotent): the row and its translations stay, readers skip it and a
     * tombstone keeps it hidden across rebuilds. False when the id is unknown.
     *
     * @throws CommentsReadOnly when the database cannot be written
     */
    public function hide(int $id): bool;

    /** Shows a hidden comment again. False when the id is unknown. @throws CommentsReadOnly */
    public function restore(int $id): bool;

    /**
     * The positions with most visible comments (a position = hash + key, the FEN without move
     * counters), count desc then hash; filters as in list() (`hidden` is ignored). Each: the full
     * FEN, the count, the per-source counts (max 6, count desc) and up to 3 sample comments
     * (text cut to 240 characters). `limit` is capped at 100.
     *
     * @param array{q?: string, source?: int, lang?: string, kind?: string, hidden?: bool} $filters
     * @return list<array{hash: string, fen: string, count: int, sources: list<array<string, mixed>>, samples: list<array<string, mixed>>}>
     */
    public function top(array $filters, int $limit): array;
}

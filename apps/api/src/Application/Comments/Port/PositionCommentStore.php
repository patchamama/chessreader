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
}

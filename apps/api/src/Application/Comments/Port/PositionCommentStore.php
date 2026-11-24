<?php

declare(strict_types=1);

namespace App\Application\Comments\Port;

/** The human commentary database: what authors said about a position. */
interface PositionCommentStore
{
    /**
     * The `san` of a comment printed before a game's first move (ply 0): it belongs to its game and
     * is listed, but it is never offered as a remark on its position nor counted among the popular ones.
     */
    public const INTRO_SAN = '@intro';

    /**
     * Comments on a position (by its 16-hex hash and its key: FEN without move
     * counters), books before Lichess studies.
     *
     * @return list<array{id: int, text: string, lang: string, ply: int, san: string, game: array{id: string, label: ?string}, source: array{title: string, author: ?string, kind: string}}>
     */
    public function forPosition(string $hash, string $key, int $limit): array;

    /** @return array{id: string, label: ?string, white: ?string, black: ?string, pgn: string, translations: array<string, string>, source: array{title: string, author: ?string, kind: string}}|null */
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
     * Sets the text of a comment in a language (the universal text of its own language, or a
     * translation), replacing the one there. False when the id is unknown.
     *
     * @throws CommentsReadOnly when the database cannot be written
     */
    public function setTranslation(int $id, string $lang, string $text): bool;

    /**
     * Sets the narration actions of a comment (the compact "0Diagonal:c8-h3, 1Arrow:f7-f5" list), replacing
     * the ones there; an empty string clears them. False when the id is unknown.
     *
     * @throws CommentsReadOnly when the database cannot be written
     */
    public function setActions(int $id, string $actions): bool;

    /**
     * Sets the PGN of a game in a language (language => pgn), replacing the one there. False when
     * the game id is unknown.
     *
     * @throws CommentsReadOnly when the database cannot be written
     */
    public function setGameTranslation(string $gameId, string $lang, string $pgn): bool;

    /**
     * Adds a game of a book with its comments (and optional translations) in one transaction.
     * The source is (kind 'book', title), reused when present; the game id is deterministic from
     * title, chapter and PGN, so repeating a call adds no duplicate comment (same hash and text in
     * that game). Input is validated by the caller. `translations` comment lists follow the order
     * of `comments`; an empty string is skipped.
     *
     * @param array{book: array{title: string, author?: ?string, lang: string}, chapter: int, game: array{label?: ?string, white?: ?string, black?: ?string, pgn: string, comments: list<array{hash: string, key: string, ply: int, move: int, san: string, text: string}>, translations?: array<string, array{pgn?: string, comments?: list<string>}>}} $data
     * @return array{gameId: string, sourceId: int, added: int, translated: int}
     * @throws CommentsReadOnly when the database cannot be written
     */
    public function addBookGame(array $data): array;

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

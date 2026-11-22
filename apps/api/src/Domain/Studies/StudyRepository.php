<?php

declare(strict_types=1);

namespace App\Domain\Studies;

/**
 * Persistence of Lichess studies. A study is an array:
 * {id, name, author, chapters, games, comments, linkedIds, groupId, partOrder, isBook,
 *  source, updatedAt, importedAt, myRating, lichessLikes, createdBy}.
 */
interface StudyRepository
{
    /** @return list<array<string, mixed>> studies (without the PGN) */
    public function list(string $sort, string $dir, ?string $author, ?string $q): array;

    /** @return list<array{author: string, count: int}> */
    public function authors(): array;

    /** @return array<string, mixed>|null */
    public function find(string $id): ?array;

    public function pgn(string $id): ?string;

    /** @return list<string> ids of all stored studies */
    public function ids(): array;

    /** @return list<string> ids of the studies of a group, in part order */
    public function groupMembers(string $groupId): array;

    /**
     * Inserts or updates a study, keeping its rating, likes and owner.
     * The group is replaced only when $setGroup is true.
     *
     * @param array{id: string, name: string, author: ?string, chapters: int, games: int, comments: int, linkedIds: list<string>, updatedAt: ?string} $info
     */
    public function save(array $info, string $pgn, string $source, ?string $groupId, ?int $partOrder, bool $setGroup, ?int $createdBy): void;

    /** @param array{myRating?: ?int, lichessLikes?: ?int} $fields */
    public function update(string $id, array $fields): void;

    /** @param list<string> $ids */
    public function delete(array $ids): int;
}

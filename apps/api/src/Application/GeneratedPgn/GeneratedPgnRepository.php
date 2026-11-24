<?php

declare(strict_types=1);

namespace App\Application\GeneratedPgn;

/** Persistence of the PGN generated from library books (table `generated_pgn`, migration 013). */
interface GeneratedPgnRepository
{
    /** @return list<array<string, mixed>> the summaries (no PGN text), newest book/chapter order */
    public function list(?int $bookId, ?string $status, ?string $q): array;

    /** @return list<array{bookId: int, bookTitle: string, count: int}> */
    public function books(): array;

    /** @return array<string, mixed>|null the record with its PGN */
    public function find(int $id): ?array;

    /** @return array<string, mixed>|null the record of that game of that book made by that user (no PGN) */
    public function findByKey(int $bookId, int $chapter, int $gameIndex, ?int $createdBy): ?array;

    /** @param array<string, mixed> $game a validated game */
    public function insert(array $game, ?int $createdBy, string $now): int;

    /** @param array<string, mixed> $fields only the columns to change (snake_case) */
    public function update(int $id, array $fields, string $now): void;

    public function delete(int $id): void;
}

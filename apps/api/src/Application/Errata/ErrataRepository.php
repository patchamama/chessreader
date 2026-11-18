<?php

declare(strict_types=1);

namespace App\Application\Errata;

/** Where validated errata entries are kept. */
interface ErrataRepository
{
    /**
     * Stores (or replaces) the entry of one game of a chapter.
     *
     * @param array<string, mixed> $entry a valid entry
     * @return string its path relative to the errata folder: <book-slug>/<chapter>-<gameIndex>.json
     */
    public function save(array $entry): string;

    /**
     * The entries of a book, of one chapter or of all of them.
     *
     * @return list<array<string, mixed>>
     */
    public function find(string $bookSlug, ?int $chapter): array;
}

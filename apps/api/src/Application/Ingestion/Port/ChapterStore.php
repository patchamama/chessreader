<?php

declare(strict_types=1);

namespace App\Application\Ingestion\Port;

/** Where a book's chapters are kept for the reader. */
interface ChapterStore
{
    /**
     * Replaces the stored chapters of a book with these, in order (chapter N
     * at index N-1), in one transaction: existing chapters keep their ids,
     * missing ones are added and extra ones removed.
     *
     * @param list<array{title: string, html: string}> $chapters
     */
    public function replaceChapters(int $bookId, array $chapters): void;
}

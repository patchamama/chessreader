<?php

declare(strict_types=1);

namespace App\Application\Library\Port;

/**
 * Chapter titles read from the book's own table of contents, so books stored
 * before titles came from the TOC show the better names without re-ingestion.
 */
interface ChapterTitleSource
{
    /** @return array<int,string>|null chapter order → title; null when the book has no source file */
    public function titlesFor(int $bookId): ?array;
}

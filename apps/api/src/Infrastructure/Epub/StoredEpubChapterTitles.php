<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

use App\Application\Library\Port\ChapterTitleSource;

/**
 * Reads chapter titles from the EPUB kept at storage/books/{id}.epub. Chapter
 * N is the N-th spine document, the same numbering ingestion stores.
 * Memoised per process and per file modification time.
 */
final class StoredEpubChapterTitles implements ChapterTitleSource
{
    /** @var array<string,array<int,string>> */
    private static array $memo = [];

    public function __construct(private readonly string $storageDir) {}

    public function titlesFor(int $bookId): ?array
    {
        $file = rtrim($this->storageDir, '/') . '/' . $bookId . '.epub';
        if (!is_file($file)) {
            return null;
        }
        $key = $file . '@' . (string) filemtime($file);
        if (isset(self::$memo[$key])) {
            return self::$memo[$key];
        }

        $zip = new \ZipArchive();
        if ($zip->open($file) !== true) {
            return null;
        }
        try {
            $titles = [];
            foreach (EpubPackage::fromZip($zip)->chapters() as $i => $chapter) {
                $titles[$i + 1] = $chapter['title'];
            }
        } finally {
            $zip->close();
        }
        return self::$memo[$key] = $titles;
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Ingestion;

use App\Application\Ingestion\Port\ChapterStore;
use App\Infrastructure\Epub\EpubPackage;

/**
 * Reads the chapters of a stored EPUB again (after it was edited) the same way
 * ProcessEpubHandler does at upload: the package's spine documents, each named
 * from the book's table of contents, stored as chapter 1..N.
 */
final class ReingestEpubChapters
{
    public function __construct(private readonly ChapterStore $chapters)
    {
    }

    /**
     * @return int the number of chapters stored
     * @throws \RuntimeException when the EPUB cannot be read or has no chapters (nothing is stored)
     */
    public function handle(int $bookId, string $epubPath): int
    {
        $zip = new \ZipArchive();
        if ($zip->open($epubPath, \ZipArchive::RDONLY) !== true) {
            throw new \RuntimeException('cannot open the EPUB');
        }
        try {
            $package = EpubPackage::fromZip($zip);
            if ($package->opfPath() === null) {
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $name = (string) $zip->getNameIndex($i);
                    if (str_ends_with(strtolower($name), '.opf')) {
                        $package = $package->withFallbackOpf($name);
                        break;
                    }
                }
            }
            $chapters = array_map(
                static fn (array $c): array => ['title' => $c['title'], 'html' => $c['html']],
                $package->chapters(),
            );
        } finally {
            $zip->close();
        }
        if ($chapters === []) {
            throw new \RuntimeException('the EPUB has no chapters');
        }
        $this->chapters->replaceChapters($bookId, $chapters);
        return count($chapters);
    }
}

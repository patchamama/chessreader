<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

use App\Application\Library\Port\ChapterStylesheetSource;

/**
 * Reads the stylesheet a chapter links (`../Styles/estilos.css`) from the EPUB
 * kept at storage/books/{id}.epub and scopes it to the reader's content, so the
 * book's own italics, bold and heading classes (`.h3`, `.h5`, `.fen`) apply.
 * Chapter N is the N-th spine document, the numbering ingestion stores.
 * Memoised per process, per file modification time and chapter.
 */
final class StoredEpubChapterStyles implements ChapterStylesheetSource
{
    /** @var array<string,?string> */
    private static array $memo = [];

    public function __construct(
        private readonly string $storageDir,
        private readonly EpubCssScoper $scoper = new EpubCssScoper(),
    ) {}

    public function stylesheetFor(int $bookId, int $order): ?string
    {
        $file = rtrim($this->storageDir, '/') . '/' . $bookId . '.epub';
        if (!is_file($file)) {
            return null;
        }
        $key = $file . '@' . (string) filemtime($file) . '#' . $order;
        if (array_key_exists($key, self::$memo)) {
            return self::$memo[$key];
        }

        $zip = new \ZipArchive();
        if ($zip->open($file) !== true) {
            return null;
        }
        try {
            $sheets = EpubPackage::fromZip($zip)->chapterStylesheets($order);
        } finally {
            $zip->close();
        }
        $css = trim(implode("\n", array_map(fn(string $s) => $this->scoper->scope($s), $sheets)));
        return self::$memo[$key] = ($css === '' ? null : $css);
    }
}

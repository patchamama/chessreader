<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/**
 * Writes entries into a stored EPUB without ever leaving it half written: the
 * archive is copied to a temporary file next to it, changed and checked
 * there, and only then renamed over the original (an atomic replace on the
 * same filesystem). Any failure removes the temporary file and leaves the
 * original as it was.
 */
final class EpubWriter
{
    /** @param ?\Closure(string):void $beforeCommit called with the finished temporary archive, just before the rename (a test seam) */
    public function __construct(private readonly ?\Closure $beforeCommit = null)
    {
    }

    /**
     * @param array<string, string|null> $changes entry path => new bytes, or null to remove the entry
     * @throws \InvalidArgumentException for an unsafe entry path (nothing is written)
     * @throws \RuntimeException when the archive cannot be written (the original is untouched)
     */
    public function write(string $epubPath, array $changes): void
    {
        foreach (array_keys($changes) as $entry) {
            self::assertSafeEntry((string) $entry);
        }
        if (!is_file($epubPath)) {
            throw new \RuntimeException('the EPUB does not exist');
        }
        $tmp = dirname($epubPath) . '/.' . basename($epubPath) . '.tmp-' . bin2hex(random_bytes(6));
        try {
            if (!copy($epubPath, $tmp)) {
                throw new \RuntimeException('cannot copy the EPUB to a temporary file');
            }
            $zip = new \ZipArchive();
            if ($zip->open($tmp) !== true) {
                throw new \RuntimeException('cannot open the EPUB archive');
            }
            foreach ($changes as $entry => $bytes) {
                $entry = (string) $entry;
                $ok = $bytes === null
                    ? ($zip->locateName($entry) === false || $zip->deleteName($entry))
                    : $zip->addFromString($entry, $bytes, \ZipArchive::FL_OVERWRITE);
                if (!$ok) {
                    $zip->close();
                    throw new \RuntimeException("cannot write the entry {$entry}");
                }
            }
            if (!$zip->close()) {
                throw new \RuntimeException('cannot finish the EPUB archive');
            }
            self::assertReadable($tmp);
            if ($this->beforeCommit !== null) {
                ($this->beforeCommit)($tmp);
            }
            if (!rename($tmp, $epubPath)) {
                throw new \RuntimeException('cannot replace the EPUB');
            }
        } finally {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
        }
    }

    /** An archive path that stays inside the EPUB: relative, no "..", no backslash or control characters, never the mimetype. */
    public static function assertSafeEntry(string $entry): void
    {
        if ($entry === '' || $entry === 'mimetype' || str_starts_with($entry, '/') || str_contains($entry, '\\')
            || preg_match('/[\x00-\x1f\x7f]/', $entry) || strlen($entry) > 1024
            || in_array('..', explode('/', $entry), true) || in_array('.', explode('/', $entry), true)) {
            throw new \InvalidArgumentException("unsafe EPUB entry path: {$entry}");
        }
    }

    private static function assertReadable(string $path): void
    {
        $zip = new \ZipArchive();
        if ($zip->open($path, \ZipArchive::CHECKCONS) !== true) {
            throw new \RuntimeException('the written EPUB archive is not valid');
        }
        $ok = $zip->numFiles > 0 && $zip->getFromName('mimetype') !== false;
        $zip->close();
        if (!$ok) {
            throw new \RuntimeException('the written EPUB archive lost its mimetype');
        }
    }
}

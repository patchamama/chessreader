<?php

declare(strict_types=1);

namespace App\Infrastructure\Errata;

use App\Application\Errata\BookSlug;
use App\Application\Errata\ErrataRepository;

/**
 * Errata entries as JSON files: <dir>/<book-slug>/<chapter>-<gameIndex>.json.
 * The slug only holds [a-z0-9-] and chapter/gameIndex are integers, so no
 * request can name a file outside <dir>.
 */
final class FilesystemErrataRepository implements ErrataRepository
{
    /** The fields of an entry: anything else in a request is not stored. */
    private const FIELDS = ['id', 'book', 'chapter', 'gameIndex', 'game', 'original', 'corrected', 'changes', 'createdAt', 'appVersion'];

    /**
     * @param int $maxPerBook files a book folder may hold (replacing one is always allowed)
     * @param int $maxBooks   book folders the store may hold: approved users cannot fill the disk
     */
    public function __construct(
        private readonly string $dir,
        private readonly int $maxPerBook = 2000,
        private readonly int $maxBooks = 5000,
    ) {
    }

    public function save(array $entry): string
    {
        $slug = BookSlug::of((string) $entry['book']['title']);
        if ($slug === '') {
            throw new \InvalidArgumentException('The book title has no letters or digits');
        }
        $relative = sprintf('%s/%d-%d.json', $slug, (int) $entry['chapter'], (int) $entry['gameIndex']);
        $folder = rtrim($this->dir, '/') . '/' . $slug;
        $file = rtrim($this->dir, '/') . '/' . $relative;
        if (!is_dir($folder) && count(glob(rtrim($this->dir, '/') . '/*', GLOB_ONLYDIR) ?: []) >= $this->maxBooks) {
            throw new \OverflowException('The errata store holds too many books');
        }
        if (!is_dir($folder) && !@mkdir($folder, 0775, true) && !is_dir($folder)) {
            throw new \RuntimeException('Cannot create the errata folder');
        }
        if (!is_file($file) && count(glob($folder . '/*.json') ?: []) >= $this->maxPerBook) {
            throw new \OverflowException('This book holds too many errata entries');
        }
        $entry = array_intersect_key($entry, array_flip(self::FIELDS));
        // Atomic write: a reader never sees half a file.
        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $json = json_encode($entry, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (file_put_contents($tmp, $json . "\n") === false || !@rename($tmp, $file)) {
            @unlink($tmp);
            throw new \RuntimeException('Cannot write the errata entry');
        }
        return $relative;
    }

    public function find(string $bookSlug, ?int $chapter): array
    {
        if (!preg_match('/^[a-z0-9][a-z0-9-]{0,79}$/', $bookSlug)) {
            return [];
        }
        $folder = rtrim($this->dir, '/') . '/' . $bookSlug;
        if (!is_dir($folder)) {
            return [];
        }
        $pattern = $chapter === null ? '*-*.json' : $chapter . '-*.json';
        $files = glob($folder . '/' . $pattern) ?: [];
        natsort($files);
        $out = [];
        foreach ($files as $file) {
            if (!preg_match('/\/\d+-\d+\.json$/', $file)) {
                continue;
            }
            $entry = json_decode((string) file_get_contents($file), true);
            if (is_array($entry)) {
                $out[] = $entry;
            }
        }
        return $out;
    }
}

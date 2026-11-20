<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/**
 * The stored EPUBs (storage/books/<id>.epub) and their backups
 * (storage/books/backup/<id>-<UTC time>.epub), kept before every change.
 *
 * Next to the backups: <id>.applied.json, the suggestion ids written into the
 * current EPUB, and <backup>.json, those of each backed-up file, so restoring
 * a backup can put the suggestions' statuses back as well.
 */
final class StoredEpubs
{
    private const BACKUP = '/^(\d{1,10})-(\d{8}T\d{6}Z)(?:-(\d{1,3}))?\.epub$/';
    private const JSON = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

    /** @var \Closure():int */
    private \Closure $now;

    /** @param ?\Closure():int $now the current Unix time (a test seam) */
    public function __construct(private readonly string $booksDir, ?\Closure $now = null)
    {
        $this->now = $now ?? static fn (): int => time();
    }

    public function path(int $bookId): string
    {
        return "{$this->booksDir}/{$bookId}.epub";
    }

    public function exists(int $bookId): bool
    {
        return is_file($this->path($bookId));
    }

    /**
     * Copies the stored EPUB to a new backup, checked byte for byte, with the
     * suggestion ids it holds. Returns the backup's file name.
     */
    public function backup(int $bookId): string
    {
        $source = $this->path($bookId);
        if (!is_file($source)) {
            throw new \RuntimeException('the book has no stored EPUB');
        }
        $dir = $this->backupDir();
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('cannot create the backup folder');
        }
        $stamp = gmdate('Ymd\THis\Z', ($this->now)());
        $name = "{$bookId}-{$stamp}.epub";
        for ($n = 2; is_file("{$dir}/{$name}"); $n++) {
            if ($n > 999) {
                throw new \RuntimeException('too many backups in one second');
            }
            $name = "{$bookId}-{$stamp}-{$n}.epub";
        }
        $tmp = "{$dir}/.{$name}.tmp-" . bin2hex(random_bytes(4));
        try {
            if (!copy($source, $tmp) || hash_file('sha256', $tmp) !== hash_file('sha256', $source)) {
                throw new \RuntimeException('cannot back up the EPUB');
            }
            $this->writeJson("{$dir}/{$name}.json", ['applied' => $this->appliedIds($bookId)]);
            if (!rename($tmp, "{$dir}/{$name}")) {
                throw new \RuntimeException('cannot back up the EPUB');
            }
        } finally {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
        }
        return $name;
    }

    /** @return list<array{name: string, size: int, createdAt: string, applied: int}> newest first */
    public function backups(int $bookId): array
    {
        $out = [];
        foreach (glob($this->backupDir() . "/{$bookId}-*.epub") ?: [] as $file) {
            $name = basename($file);
            if (!preg_match(self::BACKUP, $name, $m) || (int) $m[1] !== $bookId) {
                continue;
            }
            $at = \DateTimeImmutable::createFromFormat('Ymd\THis\Z', $m[2], new \DateTimeZone('UTC'));
            $out[] = [
                'name' => $name,
                'size' => (int) filesize($file),
                'createdAt' => $at ? $at->format('Y-m-d\TH:i:s\Z') : '',
                'applied' => count($this->backupAppliedIds($name)),
                'order' => [$m[2], (int) ($m[3] ?? 1)],
            ];
        }
        usort($out, static fn (array $a, array $b): int => $b['order'] <=> $a['order']);
        return array_map(static function (array $b): array {
            unset($b['order']);
            return $b;
        }, $out);
    }

    /** Whether the name is an existing backup of this book (its own id, the backup name shape, no path). */
    public function isBackupOf(int $bookId, string $name): bool
    {
        return preg_match(self::BACKUP, $name, $m) === 1
            && (int) $m[1] === $bookId
            && is_file($this->backupDir() . '/' . $name);
    }

    /** Puts a backup in place of the stored EPUB (copied to a temporary file, then renamed over it). */
    public function restoreFile(int $bookId, string $name): void
    {
        if (!$this->isBackupOf($bookId, $name)) {
            throw new \InvalidArgumentException('not a backup of this book');
        }
        $target = $this->path($bookId);
        $tmp = dirname($target) . '/.' . basename($target) . '.tmp-' . bin2hex(random_bytes(6));
        try {
            if (!copy($this->backupDir() . '/' . $name, $tmp) || !rename($tmp, $target)) {
                throw new \RuntimeException('cannot restore the backup');
            }
        } finally {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
        }
    }

    /** @return list<string> the suggestion ids written into the current EPUB */
    public function appliedIds(int $bookId): array
    {
        return $this->readIds($this->backupDir() . "/{$bookId}.applied.json");
    }

    /** @return list<string> the suggestion ids written into the backed-up EPUB */
    public function backupAppliedIds(string $name): array
    {
        return preg_match(self::BACKUP, $name) === 1 ? $this->readIds($this->backupDir() . "/{$name}.json") : [];
    }

    /** @param list<string> $ids */
    public function recordApplied(int $bookId, array $ids): void
    {
        $this->setAppliedIds($bookId, [...$this->appliedIds($bookId), ...$ids]);
    }

    /** @param list<string> $ids */
    public function setAppliedIds(int $bookId, array $ids): void
    {
        $ids = array_values(array_unique(array_map('strval', $ids)));
        sort($ids);
        $dir = $this->backupDir();
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('cannot create the backup folder');
        }
        $this->writeJson("{$dir}/{$bookId}.applied.json", ['applied' => $ids]);
    }

    /**
     * Runs $fn while holding this book's write lock; another writer gets
     * EpubBusyException at once instead of waiting.
     *
     * @template T
     * @param callable():T $fn
     * @return T
     */
    public function exclusive(int $bookId, callable $fn): mixed
    {
        $dir = $this->backupDir();
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('cannot create the backup folder');
        }
        $handle = fopen("{$dir}/{$bookId}.lock", 'c');
        if ($handle === false) {
            throw new \RuntimeException('cannot lock the EPUB');
        }
        try {
            if (!flock($handle, LOCK_EX | LOCK_NB)) {
                throw new EpubBusyException('the EPUB of this book is being changed right now; try again in a moment');
            }
            try {
                return $fn();
            } finally {
                flock($handle, LOCK_UN);
            }
        } finally {
            fclose($handle);
        }
    }

    private function backupDir(): string
    {
        return "{$this->booksDir}/backup";
    }

    /** @return list<string> */
    private function readIds(string $file): array
    {
        if (!is_file($file)) {
            return [];
        }
        $data = json_decode((string) file_get_contents($file), true);
        $ids = is_array($data) && is_array($data['applied'] ?? null) ? $data['applied'] : [];
        return array_values(array_filter($ids, 'is_string'));
    }

    /** @param array<string, mixed> $data */
    private function writeJson(string $file, array $data): void
    {
        $tmp = $file . '.tmp-' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, json_encode($data, self::JSON)) === false || !rename($tmp, $file)) {
            @unlink($tmp);
            throw new \RuntimeException('cannot write ' . basename($file));
        }
    }
}

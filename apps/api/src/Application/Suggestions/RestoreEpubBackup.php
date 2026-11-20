<?php

declare(strict_types=1);

namespace App\Application\Suggestions;

use App\Application\Ingestion\ReingestEpubChapters;
use App\Domain\Library\BookRepository;
use App\Infrastructure\Epub\StoredEpubs;

/**
 * Undo: puts one of a book's backups back as its EPUB. The current EPUB is
 * backed up first (so the restore can be undone too), the chapters are read
 * again, and the suggestions written in the current file but not in the
 * backup go back to accepted (those in the backup but not current become
 * applied again).
 */
final class RestoreEpubBackup
{
    public function __construct(
        private readonly BookRepository $books,
        private readonly SuggestionRepository $suggestions,
        private readonly StoredEpubs $epubs,
        private readonly ReingestEpubChapters $reingest,
    ) {
    }

    /**
     * @return array{restored: string, backup: string, reverted: list<string>, reapplied: list<string>}
     * @throws \InvalidArgumentException when the name is not a backup of this book
     * @throws \OutOfBoundsException when the book or its EPUB does not exist
     */
    public function handle(int $bookId, string $name): array
    {
        if ($this->books->findById($bookId) === null) {
            throw new \OutOfBoundsException('book not found');
        }
        if (!$this->epubs->isBackupOf($bookId, $name)) {
            throw new \InvalidArgumentException('not a backup of this book');
        }
        if (!$this->epubs->exists($bookId)) {
            throw new \OutOfBoundsException('the book has no stored EPUB');
        }

        return $this->epubs->exclusive($bookId, function () use ($bookId, $name): array {
            $current = $this->epubs->appliedIds($bookId);
            $safety = $this->epubs->backup($bookId);
            $this->epubs->restoreFile($bookId, $name);
            try {
                $this->reingest->handle($bookId, $this->epubs->path($bookId));
            } catch (\Throwable $e) {
                $this->epubs->restoreFile($bookId, $safety);
                throw new \RuntimeException('the chapters could not be read again; the EPUB was left as it was: ' . $e->getMessage(), 0, $e);
            }
            $target = $this->epubs->backupAppliedIds($name);
            $this->epubs->setAppliedIds($bookId, $target);

            $reverted = array_values(array_diff($current, $target));
            $reapplied = array_values(array_diff($target, $current));
            foreach ($reverted as $id) {
                if (($this->suggestions->get($id)['status'] ?? null) === 'applied') {
                    $this->suggestions->setStatus($id, 'accepted');
                }
            }
            foreach ($reapplied as $id) {
                $this->suggestions->setStatus($id, 'applied');
            }
            return ['restored' => $name, 'backup' => $safety, 'reverted' => $reverted, 'reapplied' => $reapplied];
        });
    }
}

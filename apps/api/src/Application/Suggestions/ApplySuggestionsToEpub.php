<?php

declare(strict_types=1);

namespace App\Application\Suggestions;

use App\Application\Errata\BookSlug;
use App\Application\Ingestion\ReingestEpubChapters;
use App\Domain\Library\BookRepository;
use App\Infrastructure\Epub\EpubSuggestionEditor;
use App\Infrastructure\Epub\EpubWriter;
use App\Infrastructure\Epub\StoredEpubs;

/**
 * Writes a book's accepted suggestions (text, insert, image, diagram-fen,
 * cover) into its stored EPUB:
 *
 *   1. back up storage/books/<id>.epub (always, before anything is written);
 *   2. plan the changes on the original archive (stale anchors are skipped);
 *   3. write the new archive atomically (temporary file, then rename);
 *   4. re-read the chapters into the database, so the reader shows the change
 *      (if that fails, the original EPUB is put back);
 *   5. mark the written suggestions applied.
 *
 * One apply or restore per book at a time.
 */
final class ApplySuggestionsToEpub
{
    private const MAX_SUGGESTIONS = 10000;

    public function __construct(
        private readonly BookRepository $books,
        private readonly SuggestionRepository $suggestions,
        private readonly StoredEpubs $epubs,
        private readonly EpubSuggestionEditor $editor,
        private readonly EpubWriter $writer,
        private readonly ReingestEpubChapters $reingest,
    ) {
    }

    /**
     * @return array{applied: list<string>, stale: list<string>, backup: ?string}
     * @throws \OutOfBoundsException when the book or its EPUB does not exist
     * @throws \App\Infrastructure\Epub\EpubBusyException when the book's EPUB is being changed
     */
    public function handle(int $bookId): array
    {
        $book = $this->books->findById($bookId);
        if ($book === null) {
            throw new \OutOfBoundsException('book not found');
        }
        if (!$this->epubs->exists($bookId)) {
            throw new \OutOfBoundsException('the book has no stored EPUB');
        }
        $accepted = array_values(array_filter(
            $this->suggestions->find(['book' => BookSlug::of($book->title), 'status' => 'accepted'], 0, self::MAX_SUGGESTIONS)['items'],
            static fn (array $s): bool => in_array($s['kind'] ?? null, EpubSuggestionEditor::KINDS, true),
        ));
        if ($accepted === []) {
            return ['applied' => [], 'stale' => [], 'backup' => null];
        }

        return $this->epubs->exclusive($bookId, function () use ($bookId, $accepted): array {
            $path = $this->epubs->path($bookId);
            $backup = $this->epubs->backup($bookId);

            $zip = new \ZipArchive();
            if ($zip->open($path, \ZipArchive::RDONLY) !== true) {
                throw new \RuntimeException('cannot open the EPUB');
            }
            try {
                $plan = $this->editor->plan($zip, $accepted);
            } finally {
                $zip->close();
            }
            if ($plan['applied'] === []) {
                return ['applied' => [], 'stale' => $plan['stale'], 'backup' => $backup];
            }

            $this->writer->write($path, $plan['changes']);
            try {
                $this->reingest->handle($bookId, $path);
            } catch (\Throwable $e) {
                $this->epubs->restoreFile($bookId, $backup);
                throw new \RuntimeException('the chapters could not be read again; the original EPUB was put back: ' . $e->getMessage(), 0, $e);
            }
            $this->epubs->recordApplied($bookId, $plan['applied']);
            foreach ($plan['applied'] as $id) {
                $this->suggestions->setStatus($id, 'applied');
            }
            return ['applied' => $plan['applied'], 'stale' => $plan['stale'], 'backup' => $backup];
        });
    }
}

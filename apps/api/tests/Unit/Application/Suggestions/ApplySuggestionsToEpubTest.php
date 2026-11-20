<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Suggestions;

use App\Application\Ingestion\Port\ChapterStore;
use App\Application\Ingestion\ReingestEpubChapters;
use App\Application\Suggestions\ApplySuggestionsToEpub;
use App\Application\Suggestions\RestoreEpubBackup;
use App\Domain\Library\Book;
use App\Domain\Library\BookRepository;
use App\Domain\Library\BookStatus;
use App\Domain\Library\Chapter;
use App\Infrastructure\Epub\EpubSuggestionEditor;
use App\Infrastructure\Epub\EpubWriter;
use App\Infrastructure\Epub\StoredEpubs;
use App\Infrastructure\Suggestions\DbalSuggestionRepository;
use App\Infrastructure\Suggestions\FilesystemSuggestionAssetStore;
use App\Tests\Unit\Infrastructure\Epub\SuggestionEpubFixture as F;
use App\Tests\Unit\Infrastructure\Suggestions\DbalSuggestionRepositoryTest;
use PHPUnit\Framework\TestCase;

final class ApplySuggestionsToEpubTest extends TestCase
{
    private string $dir;
    private string $epub;
    private DbalSuggestionRepository $repo;
    private StoredEpubs $epubs;
    /** @var array<int, list<array{title:string,html:string}>> */
    public array $stored = [];
    public ?\Throwable $failReingest = null;
    private int $now = 1_795_600_000;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/apply-suggestions-' . bin2hex(random_bytes(4));
        mkdir($this->dir . '/books', 0777, true);
        $this->epub = $this->dir . '/books/5.epub';
        rename(F::zip(), $this->epub);
        $this->repo = new DbalSuggestionRepository(DbalSuggestionRepositoryTest::migratedConnection());
        $this->epubs = new StoredEpubs($this->dir . '/books', fn (): int => $this->now++);
    }

    protected function tearDown(): void
    {
        exec('rm -rf ' . escapeshellarg($this->dir));
    }

    private function books(): BookRepository
    {
        return new class implements BookRepository {
            public function findReadyByOwner(int $ownerId): array { return []; }
            public function findById(int $id): ?Book
            {
                return $id === 5 ? new Book(5, 1, 'Placeholder Book', 'A', BookStatus::Ready, '2026-01-01') : null;
            }
            public function findByOwner(int $ownerId): array { return []; }
            public function update(int $id, string $title, string $author, string $description): void {}
            public function delete(int $id): void {}
            public function save(Book $book): int { return $book->id; }
            public function saveChapter(int $bookId, int $order, string $title, string $html): int { return 0; }
            public function findChaptersByBook(int $bookId): array { return []; }
            public function findChapter(int $bookId, int $order): ?Chapter { return null; }
        };
    }

    private function reingest(): ReingestEpubChapters
    {
        $test = $this;
        return new ReingestEpubChapters(new class ($test) implements ChapterStore {
            public function __construct(private readonly ApplySuggestionsToEpubTest $test) {}
            public function replaceChapters(int $bookId, array $chapters): void
            {
                if ($this->test->failReingest !== null) {
                    throw $this->test->failReingest;
                }
                $this->test->stored[$bookId] = $chapters;
            }
        });
    }

    private function apply(?\Closure $beforeCommit = null): ApplySuggestionsToEpub
    {
        return new ApplySuggestionsToEpub(
            $this->books(),
            $this->repo,
            $this->epubs,
            new EpubSuggestionEditor(new FilesystemSuggestionAssetStore($this->dir . '/assets')),
            new EpubWriter($beforeCommit),
            $this->reingest(),
        );
    }

    private function accepted(string $id, string $kind, array $target, mixed $after, string $status = 'accepted'): void
    {
        $this->repo->create(F::suggestion($id, $kind, $target, $after), 1);
        $this->repo->setStatus($id, $status);
    }

    private function textSuggestion(string $id = 't1', string $after = 'Corrected placeholder paragraph.'): void
    {
        $quote = mb_substr(F::C1_P1, 0, 40);
        $this->accepted($id, 'text', ['chapter' => 1, 'anchor' => ['chapter' => 1, 'blockIndex' => 1, 'quote' => $quote]], $after);
    }

    public function test_backs_up_before_any_write_applies_reingests_and_marks_applied(): void
    {
        $original = hash_file('sha256', $this->epub);
        $this->textSuggestion();
        $this->accepted('s1', 'text', ['chapter' => 1, 'anchor' => ['chapter' => 1, 'blockIndex' => 2, 'quote' => 'Not in the chapter']], 'x');
        $this->accepted('p1', 'text', ['chapter' => 1, 'anchor' => ['chapter' => 1, 'blockIndex' => 2, 'quote' => 'Second placeholder']], 'pending, not applied', 'pending');

        $backupSeenBeforeCommit = null;
        $result = $this->apply(function () use ($original, &$backupSeenBeforeCommit): void {
            $backups = glob($this->dir . '/books/backup/5-*.epub') ?: [];
            $backupSeenBeforeCommit = count($backups) === 1 && hash_file('sha256', $backups[0]) === $original
                && hash_file('sha256', $this->epub) === $original;
        })->handle(5);

        self::assertTrue($backupSeenBeforeCommit, 'the byte-identical backup exists before the EPUB is replaced');
        self::assertSame(['t1'], $result['applied']);
        self::assertSame(['s1'], $result['stale']);
        self::assertMatchesRegularExpression('/^5-\d{8}T\d{6}Z\.epub$/', (string) $result['backup']);
        self::assertSame($original, hash_file('sha256', $this->dir . '/books/backup/' . $result['backup']));
        self::assertStringContainsString('Corrected placeholder paragraph.', (string) F::read($this->epub, 'OEBPS/Text/c1.xhtml'));
        self::assertStringContainsString('Corrected placeholder paragraph.', $this->stored[5][0]['html'], 'the chapters are re-ingested');
        self::assertSame('applied', $this->repo->get('t1')['status']);
        self::assertSame('accepted', $this->repo->get('s1')['status'], 'a stale suggestion stays accepted');
        self::assertSame('pending', $this->repo->get('p1')['status']);
        self::assertSame(['t1'], $this->epubs->appliedIds(5));
    }

    public function test_nothing_accepted_writes_nothing(): void
    {
        $original = hash_file('sha256', $this->epub);
        $result = $this->apply()->handle(5);
        self::assertSame(['applied' => [], 'stale' => [], 'backup' => null], $result);
        self::assertSame($original, hash_file('sha256', $this->epub));
        self::assertDirectoryDoesNotExist($this->dir . '/books/backup');
    }

    public function test_a_failure_while_writing_leaves_the_epub_and_the_statuses_untouched(): void
    {
        $original = hash_file('sha256', $this->epub);
        $this->textSuggestion();
        try {
            $this->apply(static function (): void {
                throw new \RuntimeException('disk full (simulated)');
            })->handle(5);
            self::fail('the failure is reported');
        } catch (\RuntimeException) {
        }
        self::assertSame($original, hash_file('sha256', $this->epub));
        self::assertSame('accepted', $this->repo->get('t1')['status']);
        self::assertSame([], $this->stored);
    }

    public function test_a_failed_reingest_puts_the_original_epub_back(): void
    {
        $original = hash_file('sha256', $this->epub);
        $this->textSuggestion();
        $this->failReingest = new \RuntimeException('database locked (simulated)');
        try {
            $this->apply()->handle(5);
            self::fail('the failure is reported');
        } catch (\RuntimeException) {
        }
        self::assertSame($original, hash_file('sha256', $this->epub));
        self::assertSame('accepted', $this->repo->get('t1')['status']);
    }

    public function test_an_unknown_book_is_not_found(): void
    {
        $this->expectException(\OutOfBoundsException::class);
        $this->apply()->handle(99);
    }

    public function test_restoring_a_backup_undoes_the_apply_and_its_statuses(): void
    {
        $original = hash_file('sha256', $this->epub);
        $this->textSuggestion();
        $applied = $this->apply()->handle(5);
        $restore = new RestoreEpubBackup($this->books(), $this->repo, $this->epubs, $this->reingest());

        $result = $restore->handle(5, (string) $applied['backup']);

        self::assertSame($original, hash_file('sha256', $this->epub));
        self::assertStringNotContainsString('Corrected placeholder paragraph.', $this->stored[5][0]['html']);
        self::assertSame('accepted', $this->repo->get('t1')['status'], 'the undone suggestion can be applied again');
        self::assertSame(['t1'], $result['reverted']);
        self::assertSame([], $this->epubs->appliedIds(5));
        // The state before the restore was itself backed up, so the restore can be undone.
        self::assertNotSame($applied['backup'], $result['backup']);
        self::assertStringContainsString('Corrected placeholder paragraph.', (string) F::read($this->dir . '/books/backup/' . $result['backup'], 'OEBPS/Text/c1.xhtml'));

        $again = $restore->handle(5, $result['backup']);
        self::assertSame(['t1'], $again['reapplied']);
        self::assertSame('applied', $this->repo->get('t1')['status']);
    }

    public function test_restore_refuses_a_name_that_is_not_a_backup_of_the_book(): void
    {
        $restore = new RestoreEpubBackup($this->books(), $this->repo, $this->epubs, $this->reingest());
        $this->expectException(\InvalidArgumentException::class);
        $restore->handle(5, '../5.epub');
    }
}

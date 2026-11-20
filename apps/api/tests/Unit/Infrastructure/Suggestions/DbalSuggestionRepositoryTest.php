<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Suggestions;

use App\Infrastructure\Suggestions\DbalSuggestionRepository;
use App\Tests\Unit\Application\Suggestions\SuggestionValidatorTest;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use PHPUnit\Framework\TestCase;

final class DbalSuggestionRepositoryTest extends TestCase
{
    private Connection $db;

    protected function setUp(): void
    {
        $this->db = self::migratedConnection();
    }

    public static function migratedConnection(): Connection
    {
        $db = DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
        $files = glob(dirname(__DIR__, 4) . '/migrations/*_suggestions.sql') ?: [];
        self::assertCount(1, $files, 'one suggestions migration');
        $db->getNativeConnection()->exec((string) file_get_contents($files[0]));
        return $db;
    }

    public function test_creates_and_reads_back_a_suggestion(): void
    {
        $repo = new DbalSuggestionRepository($this->db);
        $repo->create(SuggestionValidatorTest::validSuggestion(['status' => 'accepted']), 42);
        $s = $repo->get('text-abc123.x_1');
        self::assertNotNull($s);
        self::assertSame('pending', $s['status'], 'create always stores pending');
        self::assertSame('text', $s['kind']);
        self::assertSame('Sample Book Title', $s['target']['book']);
        self::assertSame(7, $s['target']['anchor']['blockIndex']);
        self::assertSame('new placeholder text', $s['after']);
        self::assertSame('sample-book-title', $s['bookSlug']);
        self::assertSame(42, $s['createdBy']);
        self::assertSame('2026-11-20T10:00:00.000Z', $s['createdAt']);
    }

    public function test_a_duplicate_id_is_refused(): void
    {
        $repo = new DbalSuggestionRepository($this->db);
        $repo->create(SuggestionValidatorTest::validSuggestion(), null);
        $this->expectException(\DomainException::class);
        $repo->create(SuggestionValidatorTest::validSuggestion(), null);
    }

    public function test_finds_by_kind_book_status_and_chapter_with_paging(): void
    {
        $repo = new DbalSuggestionRepository($this->db);
        for ($i = 0; $i < 5; $i++) {
            $repo->create(SuggestionValidatorTest::validSuggestion(['id' => "t{$i}"]), null);
        }
        $repo->create(SuggestionValidatorTest::validSuggestion(['id' => 'img', 'kind' => 'image']), null);
        $repo->create(SuggestionValidatorTest::validSuggestion([
            'id' => 'other', 'target' => ['book' => 'Another Book', 'chapter' => 1],
        ]), null);
        $repo->setStatus('t1', 'accepted');

        self::assertSame(7, $repo->find([], 0, 100)['total']);
        self::assertSame(5, $repo->find(['kind' => 'text', 'book' => 'sample-book-title'], 0, 100)['total']);
        self::assertSame(['t1'], array_column($repo->find(['status' => 'accepted'], 0, 100)['items'], 'id'));
        self::assertSame(0, $repo->find(['chapter' => 9], 0, 100)['total']);
        $page = $repo->find(['kind' => 'text', 'book' => 'sample-book-title'], 2, 2);
        self::assertSame(['t2', 't3'], array_column($page['items'], 'id'));
        self::assertSame(5, $page['total']);
    }

    public function test_set_status_updates_and_reports_missing_ids(): void
    {
        $repo = new DbalSuggestionRepository($this->db);
        $repo->create(SuggestionValidatorTest::validSuggestion(), null);
        self::assertTrue($repo->setStatus('text-abc123.x_1', 'rejected'));
        self::assertSame('rejected', $repo->get('text-abc123.x_1')['status']);
        self::assertFalse($repo->setStatus('missing', 'rejected'));
    }

    public function test_refuses_more_rows_than_the_book_cap(): void
    {
        $repo = new DbalSuggestionRepository($this->db, maxPerBook: 2);
        $repo->create(SuggestionValidatorTest::validSuggestion(['id' => 'a']), null);
        $repo->create(SuggestionValidatorTest::validSuggestion(['id' => 'b']), null);
        $repo->create(SuggestionValidatorTest::validSuggestion([
            'id' => 'c', 'target' => ['book' => 'Another Book'],
        ]), null);
        $this->expectException(\OverflowException::class);
        $repo->create(SuggestionValidatorTest::validSuggestion(['id' => 'd']), null);
    }
}

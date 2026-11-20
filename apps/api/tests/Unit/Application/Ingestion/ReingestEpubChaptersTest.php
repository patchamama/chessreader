<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Ingestion;

use App\Application\Ingestion\ReingestEpubChapters;
use App\Infrastructure\Suggestions\DbalChapterStore;
use App\Tests\Fixtures\epub\EpubBuilder as B;
use App\Tests\Unit\Infrastructure\Epub\SuggestionEpubFixture as F;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use PHPUnit\Framework\TestCase;

final class ReingestEpubChaptersTest extends TestCase
{
    /** @var list<string> */
    private array $cleanup = [];

    protected function tearDown(): void
    {
        foreach ($this->cleanup as $p) {
            @unlink($p);
        }
    }

    public static function libraryConnection(): Connection
    {
        $db = DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
        $dir = dirname(__DIR__, 4) . '/migrations';
        foreach (['001_create_users.sql', '002_create_books.sql'] as $file) {
            $db->getNativeConnection()->exec((string) file_get_contents("{$dir}/{$file}"));
        }
        $db->insert('books', ['id' => 5, 'owner_id' => 1, 'title' => 'Placeholder Book', 'author' => 'A', 'status' => 'ready', 'created_at' => '2026-01-01']);
        return $db;
    }

    private function epub(array $override = []): string
    {
        $path = F::zip($override);
        $this->cleanup[] = $path;
        return $path;
    }

    public function test_rewrites_the_chapters_in_place_keeping_their_ids(): void
    {
        $db = self::libraryConnection();
        $db->insert('chapters', ['book_id' => 5, 'ord' => 1, 'title' => 'Old', 'html' => 'old one']);
        $db->insert('chapters', ['book_id' => 5, 'ord' => 2, 'title' => 'Old 2', 'html' => 'old two']);
        $db->insert('chapters', ['book_id' => 5, 'ord' => 3, 'title' => 'Gone', 'html' => 'no longer in the spine']);
        $db->insert('chapters', ['book_id' => 6, 'ord' => 1, 'title' => 'Other book', 'html' => 'kept']);
        $ids = $db->fetchFirstColumn('SELECT id FROM chapters WHERE book_id = 5 AND ord <= 2 ORDER BY ord');

        $count = (new ReingestEpubChapters(new DbalChapterStore($db)))->handle(5, $this->epub());

        self::assertSame(2, $count);
        $rows = $db->fetchAllAssociative('SELECT id, ord, title, html FROM chapters WHERE book_id = 5 ORDER BY ord');
        self::assertSame($ids, array_column($rows, 'id'));
        self::assertSame(['Chapter one', 'Chapter two'], array_column($rows, 'title'));
        self::assertStringContainsString(F::C1_P1, $rows[0]['html']);
        self::assertSame('kept', $db->fetchOne('SELECT html FROM chapters WHERE book_id = 6'));
    }

    public function test_an_epub_without_chapters_leaves_the_stored_chapters_alone(): void
    {
        $db = self::libraryConnection();
        $db->insert('chapters', ['book_id' => 5, 'ord' => 1, 'title' => 'Old', 'html' => 'old one']);
        $empty = $this->epub(['OEBPS/content.opf' => B::opf('', '')]);
        try {
            (new ReingestEpubChapters(new DbalChapterStore($db)))->handle(5, $empty);
            self::fail('refused');
        } catch (\RuntimeException) {
            self::assertSame('old one', $db->fetchOne('SELECT html FROM chapters WHERE book_id = 5'));
        }
    }
}

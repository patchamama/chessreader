<?php

declare(strict_types=1);

namespace App\Tests\Unit\Studies;

use App\Application\Studies\CommentChapterSource;
use App\Application\Studies\ImportStudiesHandler;
use App\Application\Studies\StudyPgnParser;
use App\Application\Studies\SyncCommentStudiesHandler;
use App\Infrastructure\Studies\DbalStudyRepository;
use App\Infrastructure\Studies\SqliteCommentChapterSource;
use PHPUnit\Framework\TestCase;

final class SyncCommentStudiesHandlerTest extends TestCase
{
    private function chapter(string $id, string $name, string $handle, int $n): string
    {
        return StudyFixtures::pgn($id, $name, $handle, array_fill(0, $n, 'comment'));
    }

    public function test_groups_chapters_by_study_and_never_overwrites_imports(): void
    {
        $repo = new DbalStudyRepository(StudiesTestSupport::connection());
        (new ImportStudiesHandler(StudiesTestSupport::source(['BBBBBBBB' => StudyFixtures::pgn('BBBBBBBB', 'Imported', 'bob', ['x'])]), $repo, new StudyPgnParser()))
            ->handle('BBBBBBBB', false, 3, 40, [], 1);
        $repo->update('BBBBBBBB', ['myRating' => 5]);

        $source = new class ([
            // two chapters of study A (one PGN each), one of B (already imported)
            StudyFixtures::pgn('AAAAAAAA', 'Alpha', 'alice', ['c1 lichess.org/study/CCCCCCCC']),
            "[Event \"x\"]\n[StudyName \"Alpha\"]\n[ChapterURL \"https://lichess.org/study/AAAAAAAA/chap0002\"]\n[Annotator \"https://lichess.org/@/alice\"]\n\n1. d4 {second} *\n",
            StudyFixtures::pgn('BBBBBBBB', 'Changed', 'zed', ['y', 'z']),
        ]) implements CommentChapterSource {
            public function __construct(private array $pgns)
            {
            }

            public function lichessChapterPgns(): iterable
            {
                return $this->pgns;
            }
        };
        $handler = new SyncCommentStudiesHandler($source, $repo, new StudyPgnParser());

        self::assertSame(['added' => 1, 'studies' => 2], $handler->handle());
        $a = $repo->find('AAAAAAAA');
        self::assertSame('comments', $a['source']);
        self::assertSame('Alpha', $a['name']);
        self::assertSame('alice', $a['author']);
        self::assertSame(2, $a['chapters']);
        self::assertSame(2, $a['comments']);
        self::assertSame(['CCCCCCCC'], $a['linkedIds']);
        self::assertStringContainsString('{second}', (string) $repo->pgn('AAAAAAAA'));
        $b = $repo->find('BBBBBBBB');
        self::assertSame('lichess', $b['source']);
        self::assertSame('Imported', $b['name']);
        self::assertSame(5, $b['myRating']);

        // idempotent
        self::assertSame(['added' => 0, 'studies' => 2], $handler->handle());
        self::assertCount(2, $repo->list('name', 'asc', null, null));
    }

    public function test_sqlite_source_reads_only_lichess_chapters_and_tolerates_missing_tables(): void
    {
        $empty = new \PDO('sqlite::memory:');
        self::assertSame([], iterator_to_array((new SqliteCommentChapterSource('', $empty))->lichessChapterPgns(), false));

        $pdo = new \PDO('sqlite::memory:');
        $pdo->exec((string) file_get_contents(__DIR__ . '/../../../migrations/005_position_comments.sql'));
        $pdo->exec("INSERT INTO comment_sources (id, kind, title, author, lang, priority) VALUES (1, 'lichess', 'S', 'a', 'en', 2), (2, 'book', 'B', 'b', 'en', 1)");
        $ins = $pdo->prepare('INSERT INTO comment_games (id, source_id, pgn) VALUES (?, ?, ?)');
        $ins->execute(['g1', 1, 'LICHESS-PGN']);
        $ins->execute(['g2', 2, 'BOOK-PGN']);
        self::assertSame(['LICHESS-PGN'], iterator_to_array((new SqliteCommentChapterSource('', $pdo))->lichessChapterPgns(), false));
    }

    public function test_sqlite_source_without_the_file_is_empty(): void
    {
        self::assertSame([], iterator_to_array((new SqliteCommentChapterSource('/nonexistent/comments.sqlite'))->lichessChapterPgns(), false));
    }
}

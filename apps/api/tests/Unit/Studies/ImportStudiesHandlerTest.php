<?php

declare(strict_types=1);

namespace App\Tests\Unit\Studies;

use App\Application\Studies\ImportStudiesHandler;
use App\Application\Studies\LichessStudyException;
use App\Application\Studies\StudyPgnParser;
use App\Infrastructure\Studies\DbalStudyRepository;
use PHPUnit\Framework\TestCase;

final class ImportStudiesHandlerTest extends TestCase
{
    private DbalStudyRepository $repo;

    protected function setUp(): void
    {
        $this->repo = new DbalStudyRepository(StudiesTestSupport::connection());
    }

    private function handler(array $studies, &$source = null): ImportStudiesHandler
    {
        $source = StudiesTestSupport::source($studies);
        return new ImportStudiesHandler($source, $this->repo, new StudyPgnParser());
    }

    private function book(): array
    {
        return [
            'AAAAAAAA' => StudyFixtures::pgn('AAAAAAAA', 'Root', 'alice', ['next lichess.org/study/BBBBBBBB', 'x']),
            'BBBBBBBB' => StudyFixtures::pgn('BBBBBBBB', 'Part B', 'alice', ['next lichess.org/study/CCCCCCCC and back lichess.org/study/AAAAAAAA']),
            'CCCCCCCC' => StudyFixtures::pgn('CCCCCCCC', 'Part C', 'alice', ['end lichess.org/study/DDDDDDDD']),
            'DDDDDDDD' => StudyFixtures::pgn('DDDDDDDD', 'Part D', 'alice', ['the end']),
        ];
    }

    public function test_imports_a_single_study_from_a_url(): void
    {
        $r = $this->handler($this->book())->handle('https://lichess.org/study/AAAAAAAA/chap0001', false, 3, 40, [], 7);
        self::assertCount(1, $r['imported']);
        $s = $r['imported'][0];
        self::assertSame('AAAAAAAA', $s['id']);
        self::assertSame('Root', $s['name']);
        self::assertSame('alice', $s['author']);
        self::assertSame(2, $s['chapters']);
        self::assertSame(['BBBBBBBB'], $s['linkedIds']);
        self::assertTrue($s['isBook']);
        self::assertNull($s['groupId']);
        self::assertSame('lichess', $s['source']);
        self::assertSame(['BBBBBBBB'], $r['linked']);
        self::assertSame([], $r['errors']);
        self::assertSame(7, $this->repo->find('AAAAAAAA')['createdBy']);
        self::assertStringContainsString('Chapter 1', (string) $this->repo->pgn('AAAAAAAA'));
    }

    public function test_follow_is_breadth_first_cycle_safe_and_grouped(): void
    {
        $h = $this->handler($this->book(), $source);
        $r = $h->handle('AAAAAAAA', true, 6, 40, [], 1);
        self::assertSame(['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD'], array_column($r['imported'], 'id'));
        self::assertSame(['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD'], $source->calls);
        self::assertSame(['AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA'], array_column($r['imported'], 'groupId'));
        self::assertSame([1, 2, 3, 4], array_column($r['imported'], 'partOrder'));
        self::assertTrue($r['imported'][3]['isBook']);
    }

    public function test_follow_is_bounded_by_depth_and_max(): void
    {
        $r = $this->handler($this->book())->handle('AAAAAAAA', true, 1, 40, [], 1);
        self::assertSame(['AAAAAAAA', 'BBBBBBBB'], array_column($r['imported'], 'id'));
        self::assertContains('CCCCCCCC', $r['linked']);

        $repo = new DbalStudyRepository(StudiesTestSupport::connection());
        $h = new ImportStudiesHandler(StudiesTestSupport::source($this->book()), $repo, new StudyPgnParser());
        $r = $h->handle('AAAAAAAA', true, 6, 2, [], 1);
        self::assertCount(2, $r['imported']);
        self::assertNotEmpty($r['skipped']);
        self::assertSame('CCCCCCCC', $r['skipped'][0]['id']);
    }

    public function test_parts_are_appended_to_the_group(): void
    {
        $studies = [
            'AAAAAAAA' => StudyFixtures::pgn('AAAAAAAA', 'Book', 'cap', ['no links']),
            'BBBBBBBB' => StudyFixtures::pgn('BBBBBBBB', 'Part 2', 'cap', ['x']),
            'CCCCCCCC' => StudyFixtures::pgn('CCCCCCCC', 'Part 3', 'cap', ['x']),
        ];
        $r = $this->handler($studies)->handle('AAAAAAAA', false, 3, 40, ['https://lichess.org/study/BBBBBBBB', 'CCCCCCCC'], 1);
        self::assertSame(['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC'], array_column($r['imported'], 'id'));
        self::assertSame(['AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA'], array_column($r['imported'], 'groupId'));
        self::assertSame([1, 2, 3], array_column($r['imported'], 'partOrder'));
    }

    public function test_a_failing_study_goes_to_errors_without_aborting(): void
    {
        $studies = $this->book();
        $studies['BBBBBBBB'] = new LichessStudyException(403, 'study BBBBBBBB is private');
        $r = $this->handler($studies)->handle('AAAAAAAA', true, 6, 40, [], 1);
        self::assertSame(['AAAAAAAA'], array_column($r['imported'], 'id'));
        self::assertSame('BBBBBBBB', $r['errors'][0]['id']);
        self::assertStringContainsString('private', $r['errors'][0]['message']);
        self::assertNull($r['imported'][0]['groupId']);
    }

    public function test_unknown_root_is_an_error_entry(): void
    {
        $r = $this->handler([])->handle('ZZZZZZZZ', false, 3, 40, [], 1);
        self::assertSame([], $r['imported']);
        self::assertSame('ZZZZZZZZ', $r['errors'][0]['id']);
    }

    public function test_invalid_ref_is_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->handler([])->handle('not a study', false, 3, 40, [], 1);
    }

    public function test_reimport_updates_pgn_and_keeps_rating_and_likes(): void
    {
        $this->handler($this->book())->handle('DDDDDDDD', false, 3, 40, [], 1);
        $this->repo->update('DDDDDDDD', ['myRating' => 4, 'lichessLikes' => 12]);
        $book = $this->book();
        $book['DDDDDDDD'] = StudyFixtures::pgn('DDDDDDDD', 'Part D v2', 'alice', ['a', 'b', 'c']);
        $r = $this->handler($book)->handle('DDDDDDDD', false, 3, 40, [], 99);
        $s = $r['imported'][0];
        self::assertSame('Part D v2', $s['name']);
        self::assertSame(3, $s['chapters']);
        self::assertSame(4, $s['myRating']);
        self::assertSame(12, $s['lichessLikes']);
        self::assertSame(1, $this->repo->find('DDDDDDDD')['createdBy']);
        self::assertCount(1, $this->repo->list('name', 'asc', null, null));
    }
}

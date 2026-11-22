<?php

declare(strict_types=1);

namespace App\Tests\Unit\Studies;

use App\Application\Studies\ImportStudiesHandler;
use App\Application\Studies\StudyCatalog;
use App\Application\Studies\StudyPgnParser;
use App\Infrastructure\Studies\DbalStudyRepository;
use PHPUnit\Framework\TestCase;

final class StudyCatalogTest extends TestCase
{
    private DbalStudyRepository $repo;
    private StudyCatalog $catalog;

    protected function setUp(): void
    {
        $this->repo = new DbalStudyRepository(StudiesTestSupport::connection());
        $this->catalog = new StudyCatalog($this->repo);
        $studies = [
            'AAAAAAAA' => StudyFixtures::pgn('AAAAAAAA', 'beta', 'alice', ['x lichess.org/study/BBBBBBBB']),
            'BBBBBBBB' => StudyFixtures::pgn('BBBBBBBB', 'Alpha Endings', 'bob', ['x']),
            'CCCCCCCC' => StudyFixtures::pgn('CCCCCCCC', 'gamma', 'alice', ['x']),
        ];
        $imp = new ImportStudiesHandler(StudiesTestSupport::source($studies), $this->repo, new StudyPgnParser());
        $imp->handle('AAAAAAAA', true, 3, 40, [], 5);
        $imp->handle('CCCCCCCC', false, 3, 40, [], 6);
    }

    /** @return list<string> */
    private function ids(array $page): array
    {
        return array_column($page['studies'], 'id');
    }

    public function test_default_sort_is_by_name_case_insensitive(): void
    {
        self::assertSame(['BBBBBBBB', 'AAAAAAAA', 'CCCCCCCC'], $this->ids($this->catalog->list('name', 'asc', null, null)));
        self::assertSame(['CCCCCCCC', 'AAAAAAAA', 'BBBBBBBB'], $this->ids($this->catalog->list('name', 'desc', null, null)));
    }

    public function test_null_ratings_and_likes_are_last_in_both_directions(): void
    {
        $this->catalog->update('CCCCCCCC', ['myRating' => 2, 'lichessLikes' => 10]);
        $this->catalog->update('AAAAAAAA', ['myRating' => 5, 'lichessLikes' => 3]);
        self::assertSame(['AAAAAAAA', 'CCCCCCCC', 'BBBBBBBB'], $this->ids($this->catalog->list('rating', 'desc', null, null)));
        self::assertSame(['CCCCCCCC', 'AAAAAAAA', 'BBBBBBBB'], $this->ids($this->catalog->list('rating', 'asc', null, null)));
        self::assertSame(['CCCCCCCC', 'AAAAAAAA', 'BBBBBBBB'], $this->ids($this->catalog->list('likes', 'desc', null, null)));
        self::assertSame(['AAAAAAAA', 'CCCCCCCC', 'BBBBBBBB'], $this->ids($this->catalog->list('likes', 'asc', null, null)));
    }

    public function test_sort_by_author_and_filters_and_authors_summary(): void
    {
        $page = $this->catalog->list('author', 'asc', null, null);
        self::assertSame(['alice', 'alice', 'bob'], array_column($page['studies'], 'author'));
        self::assertSame([['author' => 'alice', 'count' => 2], ['author' => 'bob', 'count' => 1]], $page['authors']);
        self::assertSame(['AAAAAAAA', 'CCCCCCCC'], $this->ids($this->catalog->list('name', 'asc', 'alice', null)));
        self::assertSame(['BBBBBBBB'], $this->ids($this->catalog->list('name', 'asc', null, 'ENDINGS')));
        self::assertSame([], $this->ids($this->catalog->list('name', 'asc', 'alice', 'endings')));
        // q is a plain substring, never a LIKE pattern
        self::assertSame([], $this->ids($this->catalog->list('name', 'asc', null, '%')));
    }

    public function test_unknown_sort_or_dir_is_rejected(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->catalog->list('pgn; DROP TABLE studies', 'asc', null, null);
    }

    public function test_update_validates_rating_and_likes(): void
    {
        $s = $this->catalog->update('AAAAAAAA', ['myRating' => 3, 'lichessLikes' => 0]);
        self::assertSame(3, $s['myRating']);
        self::assertSame(0, $s['lichessLikes']);
        self::assertArrayNotHasKey('createdBy', $s);
        $s = $this->catalog->update('AAAAAAAA', ['myRating' => null]);
        self::assertNull($s['myRating']);
        self::assertSame(0, $s['lichessLikes']);
        foreach ([['myRating' => 0], ['myRating' => 6], ['myRating' => '3'], ['myRating' => 2.5], ['lichessLikes' => -1], ['lichessLikes' => 'x'], ['lichessLikes' => true], []] as $bad) {
            try {
                $this->catalog->update('AAAAAAAA', $bad);
                self::fail('expected rejection of ' . json_encode($bad));
            } catch (\InvalidArgumentException) {
                self::assertTrue(true);
            }
        }
    }

    public function test_update_unknown_study(): void
    {
        $this->expectException(\OutOfBoundsException::class);
        $this->catalog->update('ZZZZZZZZ', ['myRating' => 3]);
    }

    public function test_get_returns_study_and_pgn(): void
    {
        $r = $this->catalog->get('BBBBBBBB');
        self::assertSame('Alpha Endings', $r['study']['name']);
        self::assertStringContainsString('[StudyName "Alpha Endings"]', $r['pgn']);
        self::assertNull($this->catalog->get('ZZZZZZZZ'));
    }

    public function test_delete_requires_owner_or_admin(): void
    {
        try {
            $this->catalog->delete('CCCCCCCC', false, 5, false);
            self::fail('expected forbidden');
        } catch (\DomainException) {
            self::assertNotNull($this->repo->find('CCCCCCCC'));
        }
        self::assertSame(1, $this->catalog->delete('CCCCCCCC', false, 6, false));
        self::assertNull($this->repo->find('CCCCCCCC'));
        self::assertSame(1, $this->catalog->delete('BBBBBBBB', false, 999, true));
    }

    public function test_delete_with_group_removes_the_parts_only_when_asked(): void
    {
        self::assertSame(1, $this->catalog->delete('BBBBBBBB', false, 5, false));
        self::assertNotNull($this->repo->find('AAAAAAAA'));
        // re-import to rebuild the group, then delete the root with its parts
        $imp = new ImportStudiesHandler(StudiesTestSupport::source([
            'AAAAAAAA' => StudyFixtures::pgn('AAAAAAAA', 'beta', 'alice', ['x lichess.org/study/BBBBBBBB']),
            'BBBBBBBB' => StudyFixtures::pgn('BBBBBBBB', 'Alpha Endings', 'bob', ['x']),
        ]), $this->repo, new StudyPgnParser());
        $imp->handle('AAAAAAAA', true, 3, 40, [], 5);
        self::assertSame(2, $this->catalog->delete('AAAAAAAA', true, 5, false));
        self::assertNull($this->repo->find('BBBBBBBB'));
        self::assertNotNull($this->repo->find('CCCCCCCC'));
    }

    public function test_group_delete_is_all_or_nothing_on_permissions(): void
    {
        $this->repo->save(['id' => 'DDDDDDDD', 'name' => 'd', 'author' => null, 'chapters' => 0, 'games' => 0, 'comments' => 0, 'linkedIds' => [], 'updatedAt' => null], '', 'comments', 'AAAAAAAA', 9, true, null);
        try {
            $this->catalog->delete('AAAAAAAA', true, 5, false);
            self::fail('expected forbidden');
        } catch (\DomainException) {
            self::assertNotNull($this->repo->find('AAAAAAAA'));
            self::assertNotNull($this->repo->find('DDDDDDDD'));
        }
    }

    public function test_delete_unknown_study(): void
    {
        $this->expectException(\OutOfBoundsException::class);
        $this->catalog->delete('ZZZZZZZZ', false, 1, true);
    }
}

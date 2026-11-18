<?php

declare(strict_types=1);

namespace App\Tests\Unit\Errata;

use App\Infrastructure\Errata\FilesystemErrataRepository;
use PHPUnit\Framework\TestCase;

final class FilesystemErrataRepositoryTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/errata-' . bin2hex(random_bytes(4));
    }

    protected function tearDown(): void
    {
        if (is_dir($this->dir)) {
            exec('rm -rf ' . escapeshellarg($this->dir));
        }
    }

    public function test_saves_under_book_slug_and_chapter_game_name(): void
    {
        $repo = new FilesystemErrataRepository($this->dir);
        $path = $repo->save(ErrataEntryValidatorTest::validEntry());
        self::assertSame('mis-geniales-predecesores-volumen-i/2-3.json', $path);
        $saved = json_decode((string) file_get_contents($this->dir . '/' . $path), true);
        self::assertSame('Rb1', $saved['corrected']['moves'][2]);
    }

    public function test_finds_by_book_and_chapter(): void
    {
        $repo = new FilesystemErrataRepository($this->dir);
        $entry = ErrataEntryValidatorTest::validEntry();
        $repo->save($entry);
        $other = $entry;
        $other['chapter'] = 5;
        $repo->save($other);
        self::assertCount(1, $repo->find('mis-geniales-predecesores-volumen-i', 2));
        self::assertCount(2, $repo->find('mis-geniales-predecesores-volumen-i', null));
        self::assertSame([], $repo->find('another-book', 2));
        self::assertSame([], $repo->find('../..', 2));
    }

    public function test_saving_again_replaces_the_entry(): void
    {
        $repo = new FilesystemErrataRepository($this->dir);
        $entry = ErrataEntryValidatorTest::validEntry();
        $repo->save($entry);
        $entry['corrected']['moves'][2] = 'Rc1';
        $repo->save($entry);
        $found = $repo->find('mis-geniales-predecesores-volumen-i', 2);
        self::assertCount(1, $found);
        self::assertSame('Rc1', $found[0]['corrected']['moves'][2]);
    }

    public function test_refuses_new_files_beyond_its_limits_but_replaces_existing_ones(): void
    {
        $repo = new FilesystemErrataRepository($this->dir, maxPerBook: 1, maxBooks: 1);
        $entry = ErrataEntryValidatorTest::validEntry();
        $repo->save($entry);
        $repo->save($entry); // same file again: allowed
        $other = $entry;
        $other['gameIndex'] = 4;
        try {
            $repo->save($other);
            self::fail('a second file in the book should be refused');
        } catch (\OverflowException) {
        }
        $book = $entry;
        $book['book']['title'] = 'Another book';
        $this->expectException(\OverflowException::class);
        $repo->save($book);
    }

    public function test_keeps_only_the_known_fields(): void
    {
        $repo = new FilesystemErrataRepository($this->dir);
        $entry = ErrataEntryValidatorTest::validEntry() + ['blob' => str_repeat('x', 1000)];
        $path = $repo->save($entry);
        $saved = json_decode((string) file_get_contents($this->dir . '/' . $path), true);
        self::assertArrayNotHasKey('blob', $saved);
        self::assertSame($entry['changes'], $saved['changes']);
    }
}

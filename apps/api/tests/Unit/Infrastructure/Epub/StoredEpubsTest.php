<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Infrastructure\Epub\EpubBusyException;
use App\Infrastructure\Epub\StoredEpubs;
use App\Tests\Unit\Infrastructure\Epub\SuggestionEpubFixture as F;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class StoredEpubsTest extends TestCase
{
    private string $dir;
    private int $now = 1_795_600_000; // 2026-11-24T…Z, fixed

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/stored-epubs-' . bin2hex(random_bytes(4));
        mkdir($this->dir);
        rename(F::zip(), $this->dir . '/5.epub');
    }

    protected function tearDown(): void
    {
        exec('rm -rf ' . escapeshellarg($this->dir));
    }

    private function epubs(): StoredEpubs
    {
        return new StoredEpubs($this->dir, fn (): int => $this->now);
    }

    public function test_a_backup_is_a_byte_identical_copy_named_by_book_and_utc_time(): void
    {
        $name = $this->epubs()->backup(5);
        self::assertSame('5-' . gmdate('Ymd\THis\Z', $this->now) . '.epub', $name);
        self::assertFileEquals($this->dir . '/5.epub', $this->dir . '/backup/' . $name);
        // A second backup in the same second gets its own name.
        $second = $this->epubs()->backup(5);
        self::assertNotSame($name, $second);
        self::assertFileExists($this->dir . '/backup/' . $second);
    }

    public function test_lists_the_backups_of_one_book_newest_first(): void
    {
        $first = $this->epubs()->backup(5);
        $this->now += 60;
        $second = $this->epubs()->backup(5);
        copy($this->dir . '/5.epub', $this->dir . '/6.epub');
        $this->epubs()->backup(6);
        $names = array_column($this->epubs()->backups(5), 'name');
        self::assertSame([$second, $first], $names);
    }

    /** @return iterable<string, array{string}> */
    public static function badNames(): iterable
    {
        yield 'traversal' => ['../5.epub'];
        yield 'other book' => ['6-20261124T000000Z.epub'];
        yield 'not a backup name' => ['5.epub'];
        yield 'slash' => ['x/5-20261124T000000Z.epub'];
        yield 'missing file' => ['5-20000101T000000Z.epub'];
    }

    #[DataProvider('badNames')]
    public function test_only_an_existing_backup_of_the_same_book_is_accepted(string $name): void
    {
        $this->epubs()->backup(5);
        self::assertFalse($this->epubs()->isBackupOf(5, $name));
    }

    public function test_restores_a_backup_atomically(): void
    {
        $name = $this->epubs()->backup(5);
        file_put_contents($this->dir . '/5.epub', 'changed');
        $this->epubs()->restoreFile(5, $name);
        self::assertFileEquals($this->dir . '/backup/' . $name, $this->dir . '/5.epub');
        self::assertSame([], glob($this->dir . '/.*tmp*') ?: []);
    }

    public function test_keeps_the_applied_ids_of_the_current_file_and_of_each_backup(): void
    {
        $epubs = $this->epubs();
        $epubs->recordApplied(5, ['a', 'b']);
        $name = $epubs->backup(5);
        $epubs->recordApplied(5, ['c', 'a']);
        self::assertSame(['a', 'b', 'c'], $epubs->appliedIds(5));
        self::assertSame(['a', 'b'], $epubs->backupAppliedIds($name));
        $epubs->setAppliedIds(5, ['a']);
        self::assertSame(['a'], $epubs->appliedIds(5));
    }

    public function test_only_one_writer_per_book_at_a_time(): void
    {
        $epubs = $this->epubs();
        $inner = null;
        $epubs->exclusive(5, function () use ($epubs, &$inner): void {
            try {
                $epubs->exclusive(5, static fn () => null);
            } catch (EpubBusyException $e) {
                $inner = $e;
            }
        });
        self::assertInstanceOf(EpubBusyException::class, $inner);
        self::assertSame('ok', $epubs->exclusive(5, static fn () => 'ok'), 'the lock is released afterwards');
    }
}

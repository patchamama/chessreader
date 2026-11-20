<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Infrastructure\Epub\EpubWriter;
use App\Tests\Unit\Infrastructure\Epub\SuggestionEpubFixture as F;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class EpubWriterTest extends TestCase
{
    private string $dir;
    private string $epub;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/epub-writer-' . bin2hex(random_bytes(4));
        mkdir($this->dir);
        $this->epub = $this->dir . '/5.epub';
        rename(F::zip(), $this->epub);
    }

    protected function tearDown(): void
    {
        exec('rm -rf ' . escapeshellarg($this->dir));
    }

    public function test_replaces_and_adds_entries_and_keeps_the_rest(): void
    {
        (new EpubWriter())->write($this->epub, ['OEBPS/Images/d1.png' => F::PNG, 'OEBPS/Images/new.png' => F::PNG]);
        self::assertSame(F::PNG, F::read($this->epub, 'OEBPS/Images/d1.png'));
        self::assertSame(F::PNG, F::read($this->epub, 'OEBPS/Images/new.png'));
        self::assertSame('application/epub+zip', F::read($this->epub, 'mimetype'));
        self::assertSame(F::OLD_COVER, F::read($this->epub, 'OEBPS/Images/cover.jpg'));
        self::assertSame(['5.epub'], array_values(array_diff(scandir($this->dir), ['.', '..'])), 'no temporary file is left');
    }

    public function test_a_failure_mid_way_leaves_the_original_epub_untouched(): void
    {
        $before = hash_file('sha256', $this->epub);
        $writer = new EpubWriter(beforeCommit: static function (): void {
            throw new \RuntimeException('simulated failure after the new archive was written');
        });
        try {
            $writer->write($this->epub, ['OEBPS/Text/c1.xhtml' => 'broken']);
            self::fail('the failure is reported');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('simulated failure', $e->getMessage());
        }
        self::assertSame($before, hash_file('sha256', $this->epub));
        self::assertSame(['5.epub'], array_values(array_diff(scandir($this->dir), ['.', '..'])), 'the temporary archive is removed');
    }

    /** @return iterable<string, array{string}> */
    public static function unsafeEntries(): iterable
    {
        yield 'parent segment' => ['OEBPS/../../etc/passwd'];
        yield 'absolute' => ['/etc/passwd'];
        yield 'backslash' => ['OEBPS\\..\\x'];
        yield 'control character' => ["OEBPS/x\0.png"];
        yield 'the mimetype entry' => ['mimetype'];
        yield 'empty' => [''];
    }

    #[DataProvider('unsafeEntries')]
    public function test_refuses_unsafe_entry_paths_before_writing_anything(string $entry): void
    {
        $before = hash_file('sha256', $this->epub);
        try {
            (new EpubWriter())->write($this->epub, ['OEBPS/Images/ok.png' => F::PNG, $entry => 'x']);
            self::fail('refused');
        } catch (\InvalidArgumentException) {
            self::assertSame($before, hash_file('sha256', $this->epub));
        }
    }
}

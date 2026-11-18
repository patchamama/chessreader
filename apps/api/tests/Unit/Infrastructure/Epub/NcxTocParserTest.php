<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Infrastructure\Epub\NcxTocParser;
use App\Infrastructure\Epub\TocEntry;
use App\Tests\Fixtures\epub\EpubBuilder;
use App\Tests\Fixtures\epub\EpubFixture;
use PHPUnit\Framework\TestCase;

final class NcxTocParserTest extends TestCase
{
    private string $extractDir;

    protected function setUp(): void
    {
        $epubPath = EpubFixture::create();
        $zip = new \ZipArchive();
        $zip->open($epubPath);
        $this->extractDir = sys_get_temp_dir() . '/epub_ncx_test_' . uniqid();
        mkdir($this->extractDir, 0777, true);
        $zip->extractTo($this->extractDir);
        $zip->close();
        unlink($epubPath);
    }

    protected function tearDown(): void
    {
        $this->rrmdir($this->extractDir);
    }

    public function test_parses_two_chapters_in_order(): void
    {
        $parser  = new NcxTocParser();
        $entries = $parser->parse($this->extractDir . '/OEBPS/toc.ncx');

        self::assertCount(2, $entries);
        self::assertContainsOnlyInstancesOf(TocEntry::class, $entries);

        self::assertSame(1, $entries[0]->order);
        self::assertSame('Introduction', $entries[0]->title);
        self::assertSame('Text/ch1.xhtml', $entries[0]->href);

        self::assertSame(2, $entries[1]->order);
        self::assertSame('Basic Endgames', $entries[1]->title);
        self::assertSame('Text/ch2.xhtml', $entries[1]->href);
    }

    public function test_nested_nav_points_are_kept_in_document_order(): void
    {
        $xml = EpubBuilder::ncx([
            ['Part one', 'Text/a.xhtml', [['Inner', 'Text/b.xhtml#x']]],
            ['Part two', 'Text/c.xhtml'],
        ]);

        $entries = (new NcxTocParser())->parseXml($xml);

        self::assertSame(['Part one', 'Inner', 'Part two'], array_map(fn(TocEntry $e) => $e->title, $entries));
        self::assertSame('Text/b.xhtml', $entries[1]->href);
    }

    public function test_multi_line_label_keeps_its_lines(): void
    {
        $xml = EpubBuilder::ncx([["Capítulo I\n   CELADAS  CON CEBO\n", 'Text/a.xhtml']]);

        $entries = (new NcxTocParser())->parseXml($xml);

        self::assertSame('Capítulo I — CELADAS CON CEBO', $entries[0]->title);
    }

    public function test_throws_on_missing_file(): void
    {
        $parser = new NcxTocParser();
        $this->expectException(\RuntimeException::class);
        $parser->parse('/nonexistent/path/toc.ncx');
    }

    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = "$dir/$item";
            is_dir($path) ? $this->rrmdir($path) : unlink($path);
        }
        rmdir($dir);
    }
}

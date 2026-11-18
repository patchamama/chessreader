<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Infrastructure\Epub\StoredEpubChapterStyles;
use App\Tests\Fixtures\epub\EpubBuilder as B;
use PHPUnit\Framework\TestCase;

final class StoredEpubChapterStylesTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/stored_styles_' . uniqid();
        mkdir($this->dir);
        $epub = B::zip([
            'OEBPS/content.opf' => B::opf(
                '<item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>'
                . '<item id="c2" href="Text/c2.xhtml" media-type="application/xhtml+xml"/>',
                '<itemref idref="c1"/><itemref idref="c2"/>',
            ),
            'OEBPS/Styles/estilos.css' => '.fen {display:none} .h3 {font-size:130%; font-weight:bold}',
            'OEBPS/Text/c1.xhtml' => '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head>'
                . '<link href="../Styles/estilos.css" rel="stylesheet" type="text/css" /></head><body><p>a</p></body></html>',
            'OEBPS/Text/c2.xhtml' => B::xhtml('<p>no stylesheet</p>'),
        ]);
        rename($epub, $this->dir . '/7.epub');
    }

    protected function tearDown(): void
    {
        @unlink($this->dir . '/7.epub');
        @rmdir($this->dir);
    }

    public function test_the_linked_stylesheet_of_a_chapter_is_read_and_scoped(): void
    {
        $css = (new StoredEpubChapterStyles($this->dir))->stylesheetFor(7, 1);

        self::assertNotNull($css);
        self::assertStringContainsString(':where(.epub-content) .fen {display:none}', $css);
        self::assertStringContainsString(':where(.epub-content) .h3 {font-size:130%; font-weight:bold}', $css);
    }

    public function test_a_chapter_without_stylesheet_has_none(): void
    {
        self::assertNull((new StoredEpubChapterStyles($this->dir))->stylesheetFor(7, 2));
    }

    public function test_a_book_without_epub_or_chapter_has_none(): void
    {
        $styles = new StoredEpubChapterStyles($this->dir);
        self::assertNull($styles->stylesheetFor(99, 1));
        self::assertNull($styles->stylesheetFor(7, 9));
    }
}

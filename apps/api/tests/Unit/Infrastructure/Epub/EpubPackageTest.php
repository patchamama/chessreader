<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Infrastructure\Epub\EpubPackage;
use App\Tests\Fixtures\epub\EpubBuilder as B;
use PHPUnit\Framework\TestCase;

final class EpubPackageTest extends TestCase
{
    /** @var list<string> */
    private array $cleanup = [];

    protected function tearDown(): void
    {
        foreach ($this->cleanup as $p) {
            is_dir($p) ? B::rrmdir($p) : @unlink($p);
        }
    }

    private function zipPackage(array $files): EpubPackage
    {
        $path = B::zip($files);
        $this->cleanup[] = $path;
        $zip = new \ZipArchive();
        $zip->open($path);
        return EpubPackage::fromZip($zip);
    }

    private function dirPackage(array $files): EpubPackage
    {
        $path = B::zip($files);
        $this->cleanup[] = $path;
        $dir = B::extract($path);
        $this->cleanup[] = $dir;
        return EpubPackage::fromDirectory($dir);
    }

    /** @return array<string,string> */
    private function epub2Book(): array
    {
        return [
            'OEBPS/content.opf' => B::opf(
                '<item id="ncxfile" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
                . '<item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>'
                . '<item id="c2" href="Text/c2.xhtml" media-type="application/xhtml+xml"/>'
                . '<item id="c3" href="Text/c3.xhtml" media-type="application/xhtml+xml"/>'
                . '<item id="c4" href="Text/c4.xhtml" media-type="application/xhtml+xml"/>'
                . '<item id="c5" href="Text/c5.xhtml" media-type="application/xhtml+xml"/>',
                '<itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/><itemref idref="c4"/><itemref idref="c5"/>',
                spineAttrs: 'toc="ncxfile"',
            ),
            // The NCX is NOT under the manifest id "ncx": it is found via spine@toc.
            'OEBPS/toc.ncx' => B::ncx([
                ['Prefacio Campeones que encarnaron una época', 'Text/c1.xhtml'],
                ["Capítulo I\n   CELADAS CON CEBO", 'Text/c2.xhtml', [['Sub section', 'Text/c2.xhtml#s1']]],
                // A spine document only listed as a nested entry.
                ['Parte', 'Text/c2.xhtml#p', [['Nested only', 'Text/c3.xhtml#x']]],
            ]),
            'OEBPS/Text/c1.xhtml' => B::xhtml('<h1>Prefacio<br/>Campeones que encarnaron una época</h1><p>Texto.</p>'),
            'OEBPS/Text/c2.xhtml' => B::xhtml('<h1>Something else</h1><p>Texto.</p>'),
            'OEBPS/Text/c3.xhtml' => B::xhtml('<p>Texto.</p>'),
            // Not in the TOC: its own heading names it.
            'OEBPS/Text/c4.xhtml' => B::xhtml('<h2>Apéndice<br/>Tablas</h2><p>Texto.</p>'),
            // Not in the TOC and no heading.
            'OEBPS/Text/c5.xhtml' => B::xhtml('<p>Primera línea del capítulo.</p>'),
        ];
    }

    public function test_epub2_titles_come_from_the_ncx_labels(): void
    {
        $titles = array_column($this->zipPackage($this->epub2Book())->chapters(), 'title');

        self::assertSame([
            // The label equals the heading lines: the lines are kept, joined.
            'Prefacio — Campeones que encarnaron una época',
            // A multi-line label keeps its lines.
            'Capítulo I — CELADAS CON CEBO',
            'Nested only',
            'Apéndice — Tablas',
            // Not in the TOC and no heading: a continuation of the chapter before it.
            'Apéndice — Tablas (2)',
        ], $titles);
    }

    public function test_untitled_parts_are_numbered_continuations_and_front_matter_keeps_its_number(): void
    {
        $files = $this->epub2Book();
        // An untitled part before any titled one (a cover) and two untitled parts after a chapter.
        $files['OEBPS/Text/c6.xhtml'] = B::xhtml('<p>Más texto.</p>');
        $opf = $files['OEBPS/content.opf'];
        $files['OEBPS/content.opf'] = str_replace(
            ['<item id="c5"', '<itemref idref="c1"/>', '<itemref idref="c5"/>'],
            ['<item id="c6" href="Text/c6.xhtml" media-type="application/xhtml+xml"/><item id="c0" href="Text/c0.xhtml" media-type="application/xhtml+xml"/><item id="c5"', '<itemref idref="c0"/><itemref idref="c1"/>', '<itemref idref="c5"/><itemref idref="c6"/>'],
            $opf,
        );
        $files['OEBPS/Text/c0.xhtml'] = B::xhtml('<p>Portada</p>');
        $titles = array_column($this->zipPackage($files)->chapters(), 'title');
        self::assertSame('Chapter 1', $titles[0]);
        self::assertSame(['Apéndice — Tablas (2)', 'Apéndice — Tablas (3)'], array_slice($titles, -2));
    }

    public function test_directory_and_zip_give_the_same_chapters(): void
    {
        $zip = $this->zipPackage($this->epub2Book())->chapters();
        $dir = $this->dirPackage($this->epub2Book())->chapters();

        self::assertSame(array_column($zip, 'title'), array_column($dir, 'title'));
        self::assertSame(array_column($zip, 'path'), array_column($dir, 'path'));
        self::assertSame('OEBPS/Text/c1.xhtml', $zip[0]['path']);
        self::assertStringContainsString('<h1>Prefacio', $zip[0]['html']);
    }

    public function test_epub3_titles_come_from_the_nav_document(): void
    {
        $nav = B::xhtml(
            '<nav epub:type="toc" id="toc"><ol>'
            . '<li><a href="c1.xhtml">Capítulo uno<br/>Wilhelm I</a></li>'
            . '<li><a href="c2.xhtml#start"><span>Capítulo dos</span></a>'
            . '<ol><li><a href="c2.xhtml#s1">Sub</a></li></ol></li>'
            . '</ol></nav>'
            . '<nav epub:type="landmarks"><ol><li><a href="c2.xhtml">Landmark label</a></li></ol></nav>',
        );
        $files = [
            'OEBPS/content.opf' => B::opf(
                '<item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
                . '<item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>'
                . '<item id="c2" href="Text/c2.xhtml" media-type="application/xhtml+xml"/>',
                '<itemref idref="c1"/><itemref idref="c2"/>',
                version: '3.0',
            ),
            // nav hrefs are relative to the nav document (Text/), not to the OPF.
            'OEBPS/Text/nav.xhtml' => $nav,
            'OEBPS/Text/c1.xhtml'  => B::xhtml('<h1>Uno</h1>'),
            'OEBPS/Text/c2.xhtml'  => B::xhtml('<h1>Dos</h1>'),
        ];

        $titles = array_column($this->zipPackage($files)->chapters(), 'title');

        self::assertSame(['Capítulo uno — Wilhelm I', 'Capítulo dos'], $titles);
    }

    /** @return array<string,string> */
    private function coverBook(string $meta = '', string $props = '', string $guide = ''): array
    {
        return [
            'OEBPS/content.opf' => B::opf(
                '<item id="d1" href="Images/diagram1.jpg" media-type="image/jpeg"/>'
                . "<item id=\"cv\" href=\"Images/real-cover.jpg\" media-type=\"image/jpeg\" $props/>"
                . '<item id="other" href="Images/portada-art.png" media-type="image/png"/>'
                . '<item id="cp" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>'
                . '<item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>',
                '<itemref idref="cp"/><itemref idref="c1"/>',
                meta: $meta,
                guide: $guide,
            ),
            'OEBPS/Text/cover.xhtml' => B::xhtml(
                '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'
                . '<image width="10" height="10" xlink:href="../Images/portada-art.png"/></svg>',
            ),
            'OEBPS/Text/c1.xhtml' => B::xhtml('<p>x</p>'),
            'OEBPS/Images/diagram1.jpg' => 'd',
            'OEBPS/Images/real-cover.jpg' => 'c',
            'OEBPS/Images/portada-art.png' => 'p',
        ];
    }

    public function test_cover_from_epub3_cover_image_property(): void
    {
        $pkg = $this->zipPackage($this->coverBook(props: 'properties="cover-image"'));
        self::assertSame('OEBPS/Images/real-cover.jpg', $pkg->coverPath());
    }

    public function test_cover_from_epub2_meta_cover_item_id(): void
    {
        $pkg = $this->zipPackage($this->coverBook(meta: '<meta name="cover" content="cv"/>'));
        self::assertSame('OEBPS/Images/real-cover.jpg', $pkg->coverPath());
    }

    public function test_cover_from_epub2_meta_cover_holding_an_href(): void
    {
        $pkg = $this->zipPackage($this->coverBook(meta: '<meta content="Images/real-cover.jpg" name="cover"/>'));
        self::assertSame('OEBPS/Images/real-cover.jpg', $pkg->coverPath());
    }

    public function test_cover_from_guide_cover_page_image(): void
    {
        $pkg = $this->zipPackage($this->coverBook(
            guide: '<guide><reference type="cover" title="Cover" href="Text/cover.xhtml"/></guide>',
        ));
        self::assertSame('OEBPS/Images/portada-art.png', $pkg->coverPath());
    }

    public function test_cover_falls_back_to_first_image_only_without_metadata(): void
    {
        $pkg = $this->zipPackage($this->coverBook());
        self::assertSame('OEBPS/Images/diagram1.jpg', $pkg->coverPath());
    }
}

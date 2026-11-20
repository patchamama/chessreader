<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Tests\Fixtures\epub\EpubBuilder as B;

/**
 * A tiny made-up EPUB 3 for the suggestion writer tests: two chapters, one
 * diagram image and a declared JPEG cover. Never real book content.
 */
final class SuggestionEpubFixture
{
    public const PNG = "\x89PNG\r\n\x1a\n\0\0\0\rIHDRplaceholder-png";
    public const JPG = "\xFF\xD8\xFF\xE0placeholder-jpeg";
    public const OLD_COVER = "\xFF\xD8\xFF\xE0old-cover";
    public const DIAGRAM = "\x89PNG\r\n\x1a\n\0\0\0\rIHDRold-diagram";

    public const C1_P1 = 'First placeholder paragraph of the chapter, long enough to be cut.';
    public const C1_P2 = 'Second placeholder paragraph.';

    /** @param array<string,string> $override inner path => contents */
    public static function files(array $override = []): array
    {
        $c1 = '<h1>Chapter one</h1>'
            . '<p>' . self::C1_P1 . '</p>'
            . '<p>Second <b>placeholder</b> paragraph.</p>'
            . '<p class="diagram"><img src="../Images/d1.png" alt="diagram"/></p>'
            . '<p>Line<br/>break <a id="anchor-x"></a>end.</p>';
        return array_replace([
            'OEBPS/content.opf' => B::opf(
                '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
                . '<item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>'
                . '<item id="c2" href="Text/c2.xhtml" media-type="application/xhtml+xml"/>'
                . '<item id="img1" href="Images/d1.png" media-type="image/png"/>'
                . '<item id="coverimg" href="Images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>',
                '<itemref idref="c1"/><itemref idref="c2"/>',
                version: '3.0',
            ),
            'OEBPS/nav.xhtml' => B::xhtml('<nav epub:type="toc"><ol><li><a href="Text/c1.xhtml">Chapter one</a></li><li><a href="Text/c2.xhtml">Chapter two</a></li></ol></nav>'),
            'OEBPS/Text/c1.xhtml' => B::xhtml($c1, 'c1'),
            'OEBPS/Text/c2.xhtml' => B::xhtml('<p>Another placeholder chapter text.</p>', 'c2'),
            'OEBPS/Images/d1.png' => self::DIAGRAM,
            'OEBPS/Images/cover.jpg' => self::OLD_COVER,
        ], $override);
    }

    public static function zip(array $override = []): string
    {
        return B::zip(self::files($override));
    }

    /** @return array<string, mixed> */
    public static function suggestion(string $id, string $kind, array $target, mixed $after, string $createdAt = '2026-11-20T10:00:00.000Z'): array
    {
        return [
            'id' => $id,
            'kind' => $kind,
            'target' => ['book' => 'Placeholder Book', ...$target],
            'before' => null,
            'after' => $after,
            'author' => 'user',
            'status' => 'accepted',
            'createdAt' => $createdAt,
        ];
    }

    public static function read(string $epub, string $entry): string|false
    {
        $zip = new \ZipArchive();
        $zip->open($epub);
        $data = $zip->getFromName($entry);
        $zip->close();
        return $data;
    }
}

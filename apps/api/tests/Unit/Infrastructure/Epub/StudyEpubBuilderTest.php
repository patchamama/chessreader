<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Infrastructure\Epub\EpubPackage;
use App\Infrastructure\Epub\StudyEpubBuilder;
use PHPUnit\Framework\TestCase;

final class StudyEpubBuilderTest extends TestCase
{
    /** @var list<string> */
    private array $files = [];

    protected function tearDown(): void
    {
        foreach ($this->files as $f) {
            @unlink($f);
        }
    }

    public static function svg(): string
    {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#fff"/></svg>';
    }

    /** @return array<string,mixed> */
    public static function book(): array
    {
        return [
            'title' => 'Invented Study', 'author' => 'Ada <Test>', 'language' => 'es',
            'chapters' => [
                ['title' => 'First & best', 'blocks' => [
                    ['type' => 'img', 'image' => 'd1', 'alt' => 'Start'],
                    ['type' => 'note', 'text' => "Equal · engine, depth 12\n1. e4 e5"],
                    ['type' => 'p', 'text' => '1. e4 e5 <script>x</script>'],
                ]],
                ['title' => 'Second', 'blocks' => [['type' => 'p', 'text' => 'Only text.']]],
            ],
            'images' => [['name' => 'd1', 'mime' => 'image/svg+xml', 'data' => base64_encode(self::svg())]],
            'cover' => ['mime' => 'image/svg+xml', 'data' => base64_encode(self::svg())],
        ];
    }

    private function build(array $book): string
    {
        $path = sys_get_temp_dir() . '/sb_' . uniqid() . '.epub';
        $this->files[] = $path;
        (new StudyEpubBuilder())->build($book, $path);
        return $path;
    }

    public function test_builds_an_epub_readable_through_its_own_metadata(): void
    {
        $zip = new \ZipArchive();
        $zip->open($this->build(self::book()));
        $pkg = EpubPackage::fromZip($zip);
        $chapters = $pkg->chapters();

        self::assertSame(['First & best', 'Second'], array_column($chapters, 'title'));
        self::assertSame('OEBPS/Images/cover.svg', $pkg->coverPath());
        self::assertStringContainsString('<h1>First &amp; best</h1>', $chapters[0]['html']);
        self::assertStringContainsString('src="../Images/d1.svg"', $chapters[0]['html']);
        self::assertStringContainsString("Equal · engine, depth 12<br />\n1. e4 e5", $chapters[0]['html']);
        self::assertNotFalse($zip->locateName('OEBPS/Images/d1.svg'));
        self::assertSame('application/epub+zip', $zip->getFromName('mimetype'));
    }

    public function test_texts_are_escaped_never_markup(): void
    {
        $zip = new \ZipArchive();
        $zip->open($this->build(self::book()));
        $html = $zip->getFromName('OEBPS/Text/ch1.xhtml');
        self::assertStringNotContainsString('<script>', $html);
        self::assertStringContainsString('&lt;script&gt;', $html);
        self::assertNotFalse(simplexml_load_string((string) $zip->getFromName('OEBPS/Text/ch1.xhtml')));
        self::assertStringContainsString('Ada &lt;Test&gt;', (string) $zip->getFromName('OEBPS/content.opf'));
    }

    /** @return array<string,array{0:callable(array):array}> */
    public static function invalid(): array
    {
        return [
            'no title' => [fn (array $b) => ['title' => ''] + $b],
            'no chapters' => [fn (array $b) => ['chapters' => []] + $b],
            'bad language' => [fn (array $b) => ['language' => 'x y'] + $b],
            'unknown image' => [function (array $b) { $b['chapters'][0]['blocks'][0]['image'] = 'nope'; return $b; }],
            'unknown block' => [function (array $b) { $b['chapters'][0]['blocks'][] = ['type' => 'html', 'text' => '<b>']; return $b; }],
            'bad image name' => [function (array $b) { $b['images'][0]['name'] = '../x'; return $b; }],
            'bad mime' => [function (array $b) { $b['images'][0]['mime'] = 'text/html'; return $b; }],
            'svg with script' => [function (array $b) { $b['images'][0]['data'] = base64_encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'); return $b; }],
            'not base64' => [function (array $b) { $b['cover']['data'] = '***'; return $b; }],
        ];
    }

    /** @dataProvider invalid */
    public function test_an_invalid_book_is_rejected_and_nothing_is_written(callable $change): void
    {
        $path = sys_get_temp_dir() . '/sb_bad_' . uniqid() . '.epub';
        $this->expectException(\InvalidArgumentException::class);
        try {
            (new StudyEpubBuilder())->build($change(self::book()), $path);
        } finally {
            self::assertFileDoesNotExist($path);
        }
    }

    public function test_a_book_without_cover_still_builds(): void
    {
        $b = self::book();
        $b['cover'] = null;
        $zip = new \ZipArchive();
        $zip->open($this->build($b));
        self::assertFalse($zip->locateName('OEBPS/Images/cover.svg'));
        self::assertCount(2, EpubPackage::fromZip($zip)->chapters());
    }
}

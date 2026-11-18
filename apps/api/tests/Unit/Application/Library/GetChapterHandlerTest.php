<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Library;

use App\Application\Library\GetChapterHandler;
use App\Application\Library\Port\ChapterStylesheetSource;
use App\Application\Library\Port\ChapterTitleSource;
use App\Domain\Library\BookRepository;
use App\Domain\Library\Chapter;
use PHPUnit\Framework\TestCase;

class GetChapterHandlerTest extends TestCase
{
    public function testReturnsChapterWithToc(): void
    {
        $ch0 = new Chapter(1, 42, 0, 'Introduction', '<p>Intro html</p>');
        $ch1 = new Chapter(2, 42, 1, 'Chapter One', '<p>Chapter 1 html</p>');

        $repo = $this->createMock(BookRepository::class);
        $repo->method('findChapter')->with(42, 0)->willReturn($ch0);
        $repo->method('findChaptersByBook')->with(42)->willReturn([$ch0, $ch1]);

        $handler = new GetChapterHandler($repo);
        $result  = $handler->handle(42, 0);

        $this->assertNotNull($result);
        $this->assertSame('Introduction', $result['title']);
        $this->assertSame('<p>Intro html</p>', $result['html']);
        $this->assertCount(2, $result['toc']);
        $this->assertSame(0, $result['toc'][0]['order']);
        $this->assertSame('Introduction', $result['toc'][0]['title']);
        $this->assertSame(1, $result['toc'][1]['order']);
        $this->assertSame('Chapter One', $result['toc'][1]['title']);
    }

    public function testReturnsNullWhenChapterNotFound(): void
    {
        $repo = $this->createMock(BookRepository::class);
        $repo->method('findChapter')->with(99, 0)->willReturn(null);

        $handler = new GetChapterHandler($repo);
        $result  = $handler->handle(99, 0);

        $this->assertNull($result);
    }

    public function testTitlesFromTheBookTocReplaceTheStoredOnes(): void
    {
        $ch1 = new Chapter(1, 42, 1, 'Chapter 1', '<p>a</p>');
        $ch2 = new Chapter(2, 42, 2, 'Stored two', '<p>b</p>');

        $repo = $this->createMock(BookRepository::class);
        $repo->method('findChapter')->with(42, 1)->willReturn($ch1);
        $repo->method('findChaptersByBook')->with(42)->willReturn([$ch1, $ch2]);

        $titles = $this->createMock(ChapterTitleSource::class);
        // Only chapter 1 has a better title; chapter 2 keeps the stored one.
        $titles->method('titlesFor')->with(42)->willReturn([1 => 'Prefacio — Campeones']);

        $result = (new GetChapterHandler($repo, $titles))->handle(42, 1);

        $this->assertNotNull($result);
        $this->assertSame('Prefacio — Campeones', $result['title']);
        $this->assertSame('Prefacio — Campeones', $result['toc'][0]['title']);
        $this->assertSame('Stored two', $result['toc'][1]['title']);
    }

    public function testStoredTitlesStayWhenTheBookHasNoEpub(): void
    {
        $ch1 = new Chapter(1, 7, 1, 'https://example.com', '<p>a</p>');
        $repo = $this->createMock(BookRepository::class);
        $repo->method('findChapter')->willReturn($ch1);
        $repo->method('findChaptersByBook')->willReturn([$ch1]);
        $titles = $this->createMock(ChapterTitleSource::class);
        $titles->method('titlesFor')->willReturn(null);

        $result = (new GetChapterHandler($repo, $titles))->handle(7, 1);

        $this->assertSame('https://example.com', $result['title']);
        $this->assertSame('https://example.com', $result['toc'][0]['title']);
    }
    public function testTheBookStylesheetIsInlinedInPlaceOfItsLink(): void
    {
        $html = '<html><head><link href="../Styles/estilos.css" rel="stylesheet" type="text/css" /></head><body><p class="h3">X</p></body></html>';
        $ch1  = new Chapter(1, 7, 1, 'One', $html);
        $repo = $this->createMock(BookRepository::class);
        $repo->method('findChapter')->willReturn($ch1);
        $repo->method('findChaptersByBook')->willReturn([$ch1]);
        $styles = $this->createMock(ChapterStylesheetSource::class);
        $styles->method('stylesheetFor')->with(7, 1)->willReturn(':where(.epub-content) .h3 {font-weight:bold}');

        $result = (new GetChapterHandler($repo, null, $styles))->handle(7, 1);

        $this->assertNotNull($result);
        $this->assertStringContainsString('<style data-epub-stylesheet="1">:where(.epub-content) .h3 {font-weight:bold}</style>', $result['html']);
        $this->assertStringNotContainsString('<link', $result['html']);
        $this->assertStringContainsString('<p class="h3">X</p>', $result['html']);
    }

    public function testHtmlStaysUntouchedWithoutStylesheet(): void
    {
        $ch1  = new Chapter(1, 7, 1, 'One', '<p>a</p>');
        $repo = $this->createMock(BookRepository::class);
        $repo->method('findChapter')->willReturn($ch1);
        $repo->method('findChaptersByBook')->willReturn([$ch1]);
        $styles = $this->createMock(ChapterStylesheetSource::class);
        $styles->method('stylesheetFor')->willReturn(null);

        $result = (new GetChapterHandler($repo, null, $styles))->handle(7, 1);

        $this->assertSame('<p>a</p>', $result['html']);
    }
}

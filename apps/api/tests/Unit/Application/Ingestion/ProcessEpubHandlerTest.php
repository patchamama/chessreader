<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Ingestion;

use App\Application\Ingestion\Command\ProcessEpubCommand;
use App\Application\Ingestion\ProcessEpubHandler;
use App\Domain\Library\Book;
use App\Domain\Library\BookRepository;
use App\Domain\Library\BookStatus;
use App\Domain\Library\Chapter;
use App\Infrastructure\Epub\NcxTocParser;
use App\Infrastructure\Epub\OpfManifestParser;
use App\Infrastructure\Epub\ZipEpubExtractor;
use App\Tests\Fixtures\epub\EpubBuilder;
use App\Tests\Fixtures\epub\EpubFixture;
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;

final class ProcessEpubHandlerTest extends TestCase
{
    private BookRepository&MockObject $repo;
    private ZipEpubExtractor $extractor;
    private NcxTocParser $tocParser;
    private OpfManifestParser $opfParser;
    private ProcessEpubHandler $handler;
    private string $booksDir;

    protected function setUp(): void
    {
        $this->booksDir = sys_get_temp_dir() . '/chessreader-test-books-' . bin2hex(random_bytes(4));
        $this->repo      = $this->createMock(BookRepository::class);
        $this->extractor = new ZipEpubExtractor();
        $this->tocParser = new NcxTocParser();
        $this->opfParser = new OpfManifestParser();
        $this->handler   = new ProcessEpubHandler(
            $this->repo,
            $this->extractor,
            $this->tocParser,
            $this->opfParser,
            $this->booksDir,
        );
    }

    protected function tearDown(): void
    {
        foreach (glob($this->booksDir . '/*') ?: [] as $f) {
            unlink($f);
        }
        if (is_dir($this->booksDir)) {
            rmdir($this->booksDir);
        }
    }

    public function test_the_epub_is_kept_in_the_given_books_folder_never_in_the_real_storage(): void
    {
        $real = __DIR__ . '/../../../../storage/books/1.epub';
        $before = is_file($real) ? hash_file('sha256', $real) : null;
        $this->repo->method('save')->willReturn(1);
        $this->handler->handle(new ProcessEpubCommand(ownerId: 7, epubPath: EpubFixture::create()));
        self::assertFileExists($this->booksDir . '/1.epub');
        self::assertSame($before, is_file($real) ? hash_file('sha256', $real) : null);
    }

    public function test_valid_epub_creates_ready_book_with_two_chapters(): void
    {
        $epubPath = EpubFixture::create();
        $savedChapters = [];

        // First save (Uploaded) returns id=1; subsequent saves return same id
        $this->repo
            ->expects(self::atLeastOnce())
            ->method('save')
            ->willReturnCallback(function (Book $book) {
                return 1;
            });

        $this->repo
            ->expects(self::exactly(2))
            ->method('saveChapter')
            ->willReturnCallback(function (int $bookId, int $order, string $title, string $html) use (&$savedChapters) {
                $savedChapters[] = ['order' => $order, 'title' => $title, 'html' => $html];
                return $order;
            });

        $cmd    = new ProcessEpubCommand(ownerId: 42, epubPath: $epubPath);
        $bookId = $this->handler->handle($cmd);

        self::assertSame(1, $bookId);
        self::assertCount(2, $savedChapters);
        self::assertSame('Introduction', $savedChapters[0]['title']);
        self::assertSame('Basic Endgames', $savedChapters[1]['title']);

        unlink($epubPath);
    }

    public function test_epub3_chapters_are_named_from_the_nav_document(): void
    {
        $epubPath = EpubBuilder::zip([
            'OPS/package.opf' => EpubBuilder::opf(
                '<item id="toc" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
                . '<item id="a" href="a.xhtml" media-type="application/xhtml+xml"/>',
                '<itemref idref="a"/>',
                version: '3.0',
            ),
            'OPS/nav.xhtml' => EpubBuilder::xhtml('<nav epub:type="toc"><ol><li><a href="a.xhtml">Prefacio<br/>Campeones</a></li></ol></nav>'),
            'OPS/a.xhtml'   => EpubBuilder::xhtml('<p>Primera línea.</p>'),
        ], 'OPS/package.opf');
        $saved = [];
        // A book id no real stored book uses: ingestion copies the EPUB to storage/books/{id}.epub.
        $this->repo->method('save')->willReturn(999902);
        $this->repo->method('saveChapter')->willReturnCallback(
            function (int $bookId, int $order, string $title) use (&$saved) {
                $saved[] = $title;
                return $order;
            },
        );

        $this->handler->handle(new ProcessEpubCommand(ownerId: 42, epubPath: $epubPath));

        self::assertSame(['Prefacio — Campeones'], $saved);
        unlink($epubPath);
        @unlink(__DIR__ . '/../../../../storage/books/999902.epub');
    }

    public function test_corrupt_epub_saves_failed_status_and_throws(): void
    {
        $epubPath = EpubFixture::createCorrupt();

        $savedStatuses = [];
        $this->repo
            ->expects(self::atLeastOnce())
            ->method('save')
            ->willReturnCallback(function (Book $book) use (&$savedStatuses) {
                $savedStatuses[] = $book->status;
                return 99;
            });

        $cmd = new ProcessEpubCommand(ownerId: 42, epubPath: $epubPath);

        $this->expectException(\RuntimeException::class);
        $this->handler->handle($cmd);

        $lastStatus = end($savedStatuses);
        self::assertSame(BookStatus::Failed, $lastStatus);

        unlink($epubPath);
    }
}

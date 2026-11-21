<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Library;

use App\Application\Library\ListBooksHandler;
use App\Domain\Library\Book;
use App\Domain\Library\BookRepository;
use App\Domain\Library\BookStatus;
use App\Domain\Library\Chapter;
use App\Tests\Fixtures\epub\EpubBuilder;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

final class ListBooksLanguageTest extends TestCase
{
    private BookRepository&MockObject $repo;
    private string $dir;

    protected function setUp(): void
    {
        $this->repo = $this->createMock(BookRepository::class);
        $this->dir  = sys_get_temp_dir() . '/list-books-lang-' . bin2hex(random_bytes(4));
        mkdir($this->dir, 0777, true);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/*') ?: [] as $f) {
            unlink($f);
        }
        rmdir($this->dir);
    }

    private function book(int $id, string $language = ''): Book
    {
        return new Book($id, 1, "B$id", 'A', BookStatus::Ready, '2024-01-01 00:00:00', '', $language);
    }

    public function test_listing_exposes_the_stored_language_without_backfilling(): void
    {
        $this->repo->method('findReadyByOwner')->willReturn([$this->book(1, 'de')]);
        $this->repo->expects(self::never())->method('setLanguage');

        $result = (new ListBooksHandler($this->repo, $this->dir))->handle(1);

        self::assertSame('de', $result[0]['language']);
    }

    public function test_empty_language_is_computed_once_from_the_stored_epub_and_saved(): void
    {
        $epub = EpubBuilder::zip([
            'OEBPS/content.opf' => EpubBuilder::opf('<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>', '<itemref idref="c1"/>', '<dc:language>fr-FR</dc:language>'),
            'OEBPS/c1.xhtml'    => EpubBuilder::xhtml('<p>x</p>'),
        ]);
        copy($epub, $this->dir . '/3.epub');
        unlink($epub);
        $this->repo->method('findReadyByOwner')->willReturn([$this->book(3)]);
        $this->repo->expects(self::once())->method('setLanguage')->with(3, 'fr');

        $result = (new ListBooksHandler($this->repo, $this->dir))->handle(1);

        self::assertSame('fr', $result[0]['language']);
    }

    public function test_without_a_stored_epub_it_falls_back_to_the_stored_chapters(): void
    {
        $this->repo->method('findReadyByOwner')->willReturn([$this->book(4)]);
        $this->repo->method('findChaptersByBook')->with(4)->willReturn([
            new Chapter(1, 4, 1, 'One', '<p>El rey y la reina están en el centro del tablero, pero la torre no está en la casilla de las blancas.</p>'),
        ]);
        $this->repo->expects(self::once())->method('setLanguage')->with(4, 'es');

        $result = (new ListBooksHandler($this->repo, $this->dir))->handle(1);

        self::assertSame('es', $result[0]['language']);
    }

    public function test_failures_leave_it_empty_and_do_not_break_the_listing(): void
    {
        file_put_contents($this->dir . '/5.epub', 'corrupt');
        $this->repo->method('findReadyByOwner')->willReturn([$this->book(5), $this->book(6)]);
        $this->repo->method('findChaptersByBook')->willThrowException(new \RuntimeException('db down'));
        $this->repo->expects(self::never())->method('setLanguage');

        $result = (new ListBooksHandler($this->repo, $this->dir))->handle(1);

        self::assertCount(2, $result);
        self::assertSame('', $result[0]['language']);
        self::assertSame('', $result[1]['language']);
    }
}

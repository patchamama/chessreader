<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Ingestion;

use App\Application\Ingestion\Command\ProcessEpubCommand;
use App\Application\Ingestion\ProcessEpubHandler;
use App\Domain\Library\BookRepository;
use App\Infrastructure\Epub\NcxTocParser;
use App\Infrastructure\Epub\OpfManifestParser;
use App\Infrastructure\Epub\ZipEpubExtractor;
use App\Tests\Fixtures\epub\EpubBuilder;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

final class ProcessEpubLanguageTest extends TestCase
{
    private BookRepository&MockObject $repo;
    private ProcessEpubHandler $handler;
    private string $booksDir;

    protected function setUp(): void
    {
        $this->booksDir = sys_get_temp_dir() . '/chessreader-test-books-' . bin2hex(random_bytes(4));
        $this->repo     = $this->createMock(BookRepository::class);
        $this->repo->method('save')->willReturn(5);
        $this->handler  = new ProcessEpubHandler(
            $this->repo,
            new ZipEpubExtractor(),
            new NcxTocParser(),
            new OpfManifestParser(),
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

    public function test_language_comes_from_dc_language_normalised(): void
    {
        $this->repo->expects(self::once())->method('setLanguage')->with(5, 'es');
        $this->ingest('<dc:language>spa</dc:language>', 'The king and the queen are in the middle of the board, but the rook is not there.');
    }

    public function test_language_is_detected_from_text_when_opf_has_none(): void
    {
        $this->repo->expects(self::once())->method('setLanguage')->with(5, 'es');
        $this->ingest('', 'El rey y la reina están en el centro del tablero, pero la torre no está en la casilla de las blancas.');
    }

    private function ingest(string $meta, string $text): void
    {
        $epub = EpubBuilder::zip([
            'OEBPS/content.opf' => EpubBuilder::opf('<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>', '<itemref idref="c1"/>', $meta),
            'OEBPS/c1.xhtml'    => EpubBuilder::xhtml("<p>$text</p>"),
        ]);
        $this->handler->handle(new ProcessEpubCommand(ownerId: 7, epubPath: $epub));
        unlink($epub);
    }
}

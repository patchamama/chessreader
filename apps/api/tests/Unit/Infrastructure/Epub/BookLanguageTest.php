<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Infrastructure\Epub\BookLanguage;
use App\Tests\Fixtures\epub\EpubBuilder;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class BookLanguageTest extends TestCase
{
    /** @return array<string,array{string,string}> */
    public static function codes(): array
    {
        return [
            'plain'        => ['en', 'en'],
            'region'       => ['en-US', 'en'],
            'underscore'   => ['es_ES', 'es'],
            'upper'        => ['DE', 'de'],
            'iso 639-2 en' => ['eng', 'en'],
            'iso 639-2 es' => ['spa', 'es'],
            'iso 639-2 fr' => ['fre', 'fr'],
            'iso 639-2 fr b' => ['fra', 'fr'],
            'iso 639-2 de' => ['ger', 'de'],
            'iso 639-2 de t' => ['deu', 'de'],
            'padded'       => ['  pt-BR ', 'pt'],
            'empty'        => ['', ''],
            'garbage'      => ['12', ''],
            'unknown long' => ['klingon', ''],
        ];
    }

    #[DataProvider('codes')]
    public function test_normalize(string $raw, string $expected): void
    {
        self::assertSame($expected, BookLanguage::normalize($raw));
    }

    public function test_detects_english_text(): void
    {
        $text = 'The king moved to the square and the bishop was attacked by the knight, which is why White has the advantage in this position.';
        self::assertSame('en', BookLanguage::detect($text));
    }

    public function test_detects_spanish_text(): void
    {
        $text = 'El rey se mueve a la casilla y el alfil es atacado por el caballo, por lo que las blancas tienen la ventaja en esta posición.';
        self::assertSame('es', BookLanguage::detect($text));
    }

    public function test_detects_german_french_italian_portuguese(): void
    {
        self::assertSame('de', BookLanguage::detect('Der König zieht auf das Feld und der Läufer wird von dem Springer angegriffen, das ist der Grund für den Vorteil.'));
        self::assertSame('fr', BookLanguage::detect('Le roi se déplace sur la case et le fou est attaqué par le cavalier, ce qui est une des raisons de cet avantage pour les blancs.'));
        self::assertSame('it', BookLanguage::detect('Il re si sposta sulla casa e l\'alfiere è attaccato dal cavallo, che è il motivo per cui il bianco ha un vantaggio nella posizione.'));
        self::assertSame('pt', BookLanguage::detect('O rei move-se para a casa e o bispo é atacado pelo cavalo, o que não é uma razão para as brancas terem vantagem na posição.'));
    }

    public function test_unrecognisable_or_too_short_text_gives_empty(): void
    {
        self::assertSame('', BookLanguage::detect(''));
        self::assertSame('', BookLanguage::detect('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'));
    }

    public function test_html_tags_are_ignored(): void
    {
        $html = '<p class="el la">The king and the queen are in the middle of the board, but the rook is not there.</p>';
        self::assertSame('en', BookLanguage::detect($html));
    }

    public function test_epub_declaring_a_language_uses_it(): void
    {
        $path = $this->epub('<dc:language>es-ES</dc:language>', 'The king and the queen are in the middle of the board, but the rook is not there.');
        self::assertSame('es', BookLanguage::fromEpubFile($path));
        unlink($path);
    }

    public function test_epub_without_language_is_detected_from_its_text(): void
    {
        $path = $this->epub('', 'El rey y la reina están en el centro del tablero, pero la torre no está en la casilla de las blancas.');
        self::assertSame('es', BookLanguage::fromEpubFile($path));
        unlink($path);
    }

    public function test_unreadable_epub_gives_empty(): void
    {
        self::assertSame('', BookLanguage::fromEpubFile('/nonexistent/none.epub'));
        $bad = sys_get_temp_dir() . '/not-an-epub-' . bin2hex(random_bytes(4)) . '.epub';
        file_put_contents($bad, 'not a zip');
        self::assertSame('', BookLanguage::fromEpubFile($bad));
        unlink($bad);
    }

    private function epub(string $meta, string $text): string
    {
        return EpubBuilder::zip([
            'OEBPS/content.opf' => EpubBuilder::opf(
                '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>',
                '<itemref idref="c1"/>',
                $meta,
            ),
            'OEBPS/c1.xhtml' => EpubBuilder::xhtml("<p>$text</p>"),
        ]);
    }
}

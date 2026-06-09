<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Webparser;

use App\Application\Ingestion\Port\HtmlFetcher;
use App\Application\Recognition\RecognizeMovesCommand;
use App\Application\Recognition\RecognizeMovesHandler;
use App\Application\Webparser\ParsedWebpage;
use App\Application\Webparser\ParseWebpageCommand;
use App\Application\Webparser\ParseWebpageHandler;
use App\Infrastructure\Chess\Recognition\SanRecognizer;
use App\Infrastructure\Chess\Recognition\SpanishNotationNormalizer;
use App\Infrastructure\Chess\Recognition\VariationParser;
use App\Infrastructure\Web\ReadabilityExtractor;
use PHPUnit\Framework\TestCase;

final class ParseWebpageHandlerTest extends TestCase
{
    private const FIXTURE_HTML = <<<HTML
    <!DOCTYPE html>
    <html>
    <head><title>Chess Blog</title></head>
    <body>
    <article>
    <h1>Opening theory</h1>
    <p>After 1. e4 e5 2. Nf3 Nc6 we have the Ruy Lopez setup.</p>
    <img src="g1.jpg" alt="diagram after 2.Nf3">
    <img src="g2.jpg" alt="diagram 2">
    <p>Continue with 3. Bb5 a6.</p>
    </article>
    </body>
    </html>
    HTML;

    private function makeHandler(string $fixtureHtml): ParseWebpageHandler
    {
        $fetcher = new class($fixtureHtml) implements HtmlFetcher {
            public function __construct(private string $html) {}
            public function fetch(string $url): string { return $this->html; }
        };

        $recognizer = new RecognizeMovesHandler(
            new SpanishNotationNormalizer(),
            new SanRecognizer(),
            new VariationParser(),
        );

        return new ParseWebpageHandler($fetcher, new ReadabilityExtractor(), $recognizer);
    }

    public function test_returns_parsedwebpage_with_html_and_games_and_images(): void
    {
        $handler = $this->makeHandler(self::FIXTURE_HTML);
        $result  = $handler->handle(new ParseWebpageCommand('http://example.com/chess'));

        $this->assertInstanceOf(ParsedWebpage::class, $result);
        $this->assertNotEmpty($result->html);
    }

    public function test_recognises_games_from_page_text(): void
    {
        $handler = $this->makeHandler(self::FIXTURE_HTML);
        $result  = $handler->handle(new ParseWebpageCommand('http://example.com/chess'));

        // Should recognise at least one game (1.e4 e5 2.Nf3 Nc6 ... 3.Bb5 a6)
        $this->assertNotEmpty($result->games);

        $game = $result->games[0];
        $nodes = $game->tree->getNodes();
        $sans  = array_map(fn($n) => $n->san, array_values($nodes));

        $this->assertContains('e4', $sans);
        $this->assertContains('Nf3', $sans);
    }

    public function test_extracts_diagram_images(): void
    {
        $handler = $this->makeHandler(self::FIXTURE_HTML);
        $result  = $handler->handle(new ParseWebpageCommand('http://example.com/chess'));

        $this->assertCount(2, $result->images);

        $srcs = array_column($result->images, 'src');
        $this->assertContains('g1.jpg', $srcs);
        $this->assertContains('g2.jpg', $srcs);

        // alt text preserved
        $alts = array_column($result->images, 'alt');
        $this->assertContains('diagram after 2.Nf3', $alts);
    }

    public function test_images_empty_when_no_imgs(): void
    {
        $html = '<html><body><article><p>1. e4 e5</p></article></body></html>';
        $handler = $this->makeHandler($html);
        $result  = $handler->handle(new ParseWebpageCommand('http://example.com'));

        $this->assertEmpty($result->images);
    }

    public function test_empty_page_returns_empty_games_and_images(): void
    {
        $handler = $this->makeHandler('');
        $result  = $handler->handle(new ParseWebpageCommand('http://example.com'));

        $this->assertSame('', $result->html);
        $this->assertEmpty($result->games);
        $this->assertEmpty($result->images);
    }

    public function test_toarray_shape(): void
    {
        $handler = $this->makeHandler(self::FIXTURE_HTML);
        $arr     = $handler->handle(new ParseWebpageCommand('http://example.com'))->toArray();

        $this->assertArrayHasKey('html', $arr);
        $this->assertArrayHasKey('games', $arr);
        $this->assertArrayHasKey('images', $arr);
        $this->assertIsArray($arr['games']);
        $this->assertIsArray($arr['images']);
    }
}

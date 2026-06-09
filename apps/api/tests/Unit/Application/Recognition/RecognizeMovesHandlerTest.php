<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Recognition;

use App\Application\Recognition\RecognizeMovesCommand;
use App\Application\Recognition\RecognizeMovesHandler;
use App\Infrastructure\Chess\Recognition\SanRecognizer;
use App\Infrastructure\Chess\Recognition\SpanishNotationNormalizer;
use App\Infrastructure\Chess\Recognition\VariationParser;
use PHPUnit\Framework\TestCase;

class RecognizeMovesHandlerTest extends TestCase
{
    private RecognizeMovesHandler $handler;

    protected function setUp(): void
    {
        $this->handler = new RecognizeMovesHandler(
            new SpanishNotationNormalizer(),
            new SanRecognizer(),
            new VariationParser(),
        );
    }

    public function testReturnsEmptyArrayForTextWithNoMoves(): void
    {
        $result = $this->handler->handle(new RecognizeMovesCommand('This is a chess book.'));
        $this->assertEmpty($result);
    }

    public function testRecognisesSimpleGame(): void
    {
        $result = $this->handler->handle(new RecognizeMovesCommand('1. e4 e5 2. Nf3 Nc6'));
        $this->assertCount(1, $result);
        $nodes = $result[0]->tree->mainlineNodes();
        $this->assertSame(['e4', 'e5', 'Nf3', 'Nc6'], array_map(fn($n) => $n->san, $nodes));
    }

    public function testRecognisesSpanishNotation(): void
    {
        $result = $this->handler->handle(new RecognizeMovesCommand('1. e4 e5 2. Cf3 Cc6'));
        $this->assertCount(1, $result);
        $nodes = $result[0]->tree->mainlineNodes();
        $this->assertSame(['e4', 'e5', 'Nf3', 'Nc6'], array_map(fn($n) => $n->san, $nodes));
    }

    public function testReturnsCharStartAndCharEnd(): void
    {
        $text = 'Opening: 1. e4 e5 2. Nf3.';
        $result = $this->handler->handle(new RecognizeMovesCommand($text));
        $this->assertCount(1, $result);
        $this->assertGreaterThanOrEqual(0, $result[0]->charStart);
        $this->assertGreaterThan($result[0]->charStart, $result[0]->charEnd);
    }

    public function testHandlesChapterSnippet(): void
    {
        $text = 'The opening is critical. 1. e4 e5 2. Nf3 Nc6 3. Bc4 gives white the Italian.';
        $result = $this->handler->handle(new RecognizeMovesCommand($text));
        $this->assertNotEmpty($result);
        $nodes = $result[0]->tree->mainlineNodes();
        $sans = array_map(fn($n) => $n->san, $nodes);
        $this->assertContains('Bc4', $sans);
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Chess;

use App\Infrastructure\Chess\Recognition\SanRecognizer;
use App\Infrastructure\Chess\Recognition\SanToken;
use PHPUnit\Framework\TestCase;

class SanRecognizerTest extends TestCase
{
    private SanRecognizer $recognizer;

    protected function setUp(): void
    {
        $this->recognizer = new SanRecognizer();
    }

    public function testEmptyStringReturnsEmptyArray(): void
    {
        $this->assertEmpty($this->recognizer->tokenize(''));
    }

    public function testTokenizesSimpleMainline(): void
    {
        $tokens = $this->recognizer->tokenize('1. e4 e5 2. Nf3 Nc6');
        $moveTokens = array_filter($tokens, fn(SanToken $t) => $t->type === SanToken::TYPE_MOVE);
        $this->assertCount(4, $moveTokens);
        $sans = array_map(fn(SanToken $t) => $t->san, array_values($moveTokens));
        $this->assertSame(['e4', 'e5', 'Nf3', 'Nc6'], $sans);
    }

    public function testProducesCorrectCharacterOffsets(): void
    {
        $text = '1. e4 e5';
        $tokens = $this->recognizer->tokenize($text);
        $moveTokens = array_filter($tokens, fn(SanToken $t) => $t->type === SanToken::TYPE_MOVE);
        $moveTokens = array_values($moveTokens);

        $e4 = $moveTokens[0];
        $e5 = $moveTokens[1];

        $this->assertSame('e4', substr($text, $e4->charStart, $e4->charEnd - $e4->charStart));
        $this->assertSame('e5', substr($text, $e5->charStart, $e5->charEnd - $e5->charStart));
    }

    public function testAssignsColorsToMoves(): void
    {
        $tokens = $this->recognizer->tokenize('1. e4 e5 2. Nf3 Nc6');
        $moveTokens = array_values(array_filter($tokens, fn(SanToken $t) => $t->type === SanToken::TYPE_MOVE));

        $this->assertSame('white', $moveTokens[0]->color);
        $this->assertSame('black', $moveTokens[1]->color);
        $this->assertSame('white', $moveTokens[2]->color);
        $this->assertSame('black', $moveTokens[3]->color);
    }

    public function testAssignsMoveNumbers(): void
    {
        $tokens = $this->recognizer->tokenize('1. e4 e5 2. Nf3 Nc6');
        $moveTokens = array_values(array_filter($tokens, fn(SanToken $t) => $t->type === SanToken::TYPE_MOVE));

        $this->assertSame(1, $moveTokens[0]->moveNumber);
        $this->assertSame(1, $moveTokens[1]->moveNumber);
        $this->assertSame(2, $moveTokens[2]->moveNumber);
        $this->assertSame(2, $moveTokens[3]->moveNumber);
    }

    public function testHandlesEllipsis(): void
    {
        $tokens = $this->recognizer->tokenize('2... Nc6');
        $numTokens = array_filter($tokens, fn(SanToken $t) => $t->type === SanToken::TYPE_MOVE_NUMBER);
        $numToken = array_values($numTokens)[0];
        $this->assertTrue($numToken->isEllipsis);
        $this->assertSame('black', $numToken->color);
    }

    public function testHandlesVariationParentheses(): void
    {
        $tokens = $this->recognizer->tokenize('1. e4 e5 2. Nf3 (2. d4) 2... Nc6');
        $opens = array_filter($tokens, fn(SanToken $t) => $t->type === SanToken::TYPE_VARIATION_OPEN);
        $closes = array_filter($tokens, fn(SanToken $t) => $t->type === SanToken::TYPE_VARIATION_CLOSE);
        $this->assertCount(1, $opens);
        $this->assertCount(1, $closes);
    }

    public function testHandlesChecksAndAnnotations(): void
    {
        $tokens = $this->recognizer->tokenize('2. Qh5+ Nc6 4. Qxf7#');
        $moveTokens = array_values(array_filter($tokens, fn(SanToken $t) => $t->type === SanToken::TYPE_MOVE));
        $sans = array_map(fn(SanToken $t) => $t->san, $moveTokens);
        $this->assertContains('Qh5+', $sans);
        $this->assertContains('Qxf7#', $sans);
    }

    public function testHandlesCastling(): void
    {
        $tokens = $this->recognizer->tokenize('4. O-O O-O-O');
        $moveTokens = array_values(array_filter($tokens, fn(SanToken $t) => $t->type === SanToken::TYPE_MOVE));
        $sans = array_map(fn(SanToken $t) => $t->san, $moveTokens);
        $this->assertContains('O-O', $sans);
        $this->assertContains('O-O-O', $sans);
    }

    public function testMixedProseWithMoves(): void
    {
        $text = 'After 1. e4 white controls the center.';
        $tokens = $this->recognizer->tokenize($text);
        $moveTokens = array_values(array_filter($tokens, fn(SanToken $t) => $t->type === SanToken::TYPE_MOVE));
        $this->assertNotEmpty($moveTokens);
        $e4 = array_values($moveTokens)[0];
        $this->assertSame('e4', substr($text, $e4->charStart, $e4->charEnd - $e4->charStart));
    }
}

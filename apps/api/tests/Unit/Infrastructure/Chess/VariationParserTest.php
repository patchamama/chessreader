<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Chess;

use App\Infrastructure\Chess\Recognition\SanRecognizer;
use App\Infrastructure\Chess\Recognition\VariationParser;
use PHPUnit\Framework\TestCase;

class VariationParserTest extends TestCase
{
    private SanRecognizer $recognizer;
    private VariationParser $parser;

    protected function setUp(): void
    {
        VariationParser::resetCounter();
        $this->recognizer = new SanRecognizer();
        $this->parser = new VariationParser();
    }

    private function build(string $text): \App\Domain\Chess\GameTree
    {
        return $this->parser->buildGameTree($this->recognizer->tokenize($text));
    }

    public function testBuildsSimpleMainline(): void
    {
        $tree = $this->build('1. e4 e5 2. Nf3 Nc6');
        $nodes = $tree->mainlineNodes();
        $this->assertCount(4, $nodes);
        $this->assertSame(['e4', 'e5', 'Nf3', 'Nc6'], array_map(fn($n) => $n->san, $nodes));
    }

    public function testSetsFromToSquares(): void
    {
        $tree = $this->build('1. e4');
        $node = $tree->mainlineNodes()[0];
        $this->assertSame('e2', $node->from);
        $this->assertSame('e4', $node->to);
    }

    public function testSetsFenOnEachNode(): void
    {
        $tree = $this->build('1. e4');
        $node = $tree->mainlineNodes()[0];
        $this->assertStringContainsString('RNBQKBNR', $node->fen);
        $this->assertStringContainsString('4P3', $node->fen);
    }

    public function testSetsMoveNumberAndColor(): void
    {
        $tree = $this->build('1. e4 e5 2. Nf3 Nc6');
        $nodes = $tree->mainlineNodes();
        $this->assertSame(1, $nodes[0]->moveNumber);
        $this->assertSame('white', $nodes[0]->color);
        $this->assertSame(1, $nodes[1]->moveNumber);
        $this->assertSame('black', $nodes[1]->color);
        $this->assertSame(2, $nodes[2]->moveNumber);
        $this->assertSame('white', $nodes[2]->color);
        $this->assertSame(2, $nodes[3]->moveNumber);
        $this->assertSame('black', $nodes[3]->color);
    }

    public function testMarksIllegalMoveAsInvalid(): void
    {
        $tree = $this->build('1. e4 e5 2. Nc4'); // Nc4 is illegal
        $nodes = $tree->mainlineNodes();
        $invalidNode = null;
        foreach ($nodes as $n) {
            if ($n->san === 'Nc4') {
                $invalidNode = $n;
            }
        }
        $this->assertNotNull($invalidNode);
        $this->assertTrue($invalidNode->invalid);
        $this->assertCount(3, $nodes);
    }

    public function testHandlesCastling(): void
    {
        $tree = $this->build('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O');
        $nodes = $tree->mainlineNodes();
        $castleNode = null;
        foreach ($nodes as $n) {
            if ($n->san === 'O-O') {
                $castleNode = $n;
            }
        }
        $this->assertNotNull($castleNode);
        $this->assertSame('e1', $castleNode->from);
        $this->assertSame('g1', $castleNode->to);
    }

    public function testBuildsVariationAndReturnsToMainline(): void
    {
        $tree = $this->build('1. e4 e5 2. Nf3 (2. d4) 2... Nc6');
        $mainNodes = $tree->mainlineNodes();
        $mainSans = array_map(fn($n) => $n->san, $mainNodes);
        $this->assertContains('Nf3', $mainSans);
        $this->assertContains('Nc6', $mainSans);
        // d4 exists but not on mainline
        $allNodes = $tree->getNodes();
        $d4 = null;
        foreach ($allNodes as $n) {
            if ($n->san === 'd4') {
                $d4 = $n;
            }
        }
        $this->assertNotNull($d4);
    }

    public function testSupportsNestedVariations(): void
    {
        $tree = $this->build('1. e4 e5 2. Nf3 (2. d4 (2. c4)) 2... Nc6');
        $allNodes = $tree->getNodes();
        $d4 = $c4 = null;
        foreach ($allNodes as $n) {
            if ($n->san === 'd4') $d4 = $n;
            if ($n->san === 'c4') $c4 = $n;
        }
        $this->assertNotNull($d4);
        $this->assertNotNull($c4);
        $main = $tree->mainlineNodes();
        $this->assertContains('Nc6', array_map(fn($n) => $n->san, $main));
    }

    public function testPathToNode(): void
    {
        $tree = $this->build('1. e4 e5 2. Nf3');
        $nodes = $tree->mainlineNodes();
        $nf3 = null;
        foreach ($nodes as $n) {
            if ($n->san === 'Nf3') $nf3 = $n;
        }
        $this->assertNotNull($nf3);
        $path = $tree->pathToNode($nf3->id);
        $this->assertCount(3, $path);
        $this->assertSame(['e4', 'e5', 'Nf3'], array_map(fn($n) => $n->san, $path));
    }
}

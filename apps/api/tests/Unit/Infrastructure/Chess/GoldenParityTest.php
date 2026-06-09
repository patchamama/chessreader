<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Chess;

use App\Infrastructure\Chess\Recognition\SanRecognizer;
use App\Infrastructure\Chess\Recognition\SpanishNotationNormalizer;
use App\Infrastructure\Chess\Recognition\VariationParser;
use PHPUnit\Framework\TestCase;

/**
 * Golden parity tests: load shared fixtures from fixtures/golden/
 * and assert the PHP implementation produces matching trees.
 *
 * FEN comparison: compare only the first 3 FEN fields (board + active + castling),
 * ignoring EP square (field 4) — chess.js always uses '-' while p-chess/chess uses the real EP square.
 */
class GoldenParityTest extends TestCase
{
    private SpanishNotationNormalizer $normalizer;
    private SanRecognizer $recognizer;
    private VariationParser $parser;
    private string $fixturesDir;

    protected function setUp(): void
    {
        VariationParser::resetCounter();
        $this->normalizer = new SpanishNotationNormalizer();
        $this->recognizer = new SanRecognizer();
        $this->parser     = new VariationParser();
        $this->fixturesDir = dirname(__DIR__, 6) . '/fixtures/golden';
    }

    private function loadFixture(string $name): array
    {
        $path = $this->fixturesDir . '/' . $name;
        $this->assertFileExists($path, "Fixture $name not found at $path");
        return json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    private function buildFromFixture(string $inputText): \App\Domain\Chess\GameTree
    {
        $normalised = $this->normalizer->normalizeText($inputText);
        $tokens = $this->recognizer->tokenize($normalised);
        return $this->parser->buildGameTree($tokens);
    }

    private function fenFields123(string $fen): string
    {
        $parts = explode(' ', $fen);
        return implode(' ', array_slice($parts, 0, 3));
    }

    // -------------------------------------------------------------------------
    // simple-mainline
    // -------------------------------------------------------------------------

    public function testSimpleMainlineMatchesFixture(): void
    {
        $fixture = $this->loadFixture('simple-mainline.json');
        $tree = $this->buildFromFixture($fixture['inputText']);
        $nodes = $tree->mainlineNodes();

        $this->assertCount(count($fixture['expectedMainline']), $nodes);

        foreach ($nodes as $i => $node) {
            $expected = $fixture['expectedMainline'][$i];
            $this->assertSame($expected['san'], $node->san, "san mismatch at index $i");
            $this->assertSame($expected['from'], $node->from, "from mismatch at index $i");
            $this->assertSame($expected['to'], $node->to, "to mismatch at index $i");
            $this->assertSame($expected['fenFields123'], $this->fenFields123($node->fen), "fen mismatch at index $i");
            $this->assertSame($expected['moveNumber'], $node->moveNumber, "moveNumber mismatch at index $i");
            $this->assertSame($expected['color'], $node->color, "color mismatch at index $i");
        }
    }

    // -------------------------------------------------------------------------
    // spanish-notation
    // -------------------------------------------------------------------------

    public function testSpanishNotationMatchesFixture(): void
    {
        $fixture = $this->loadFixture('spanish-notation.json');
        $tree = $this->buildFromFixture($fixture['inputText']);
        $nodes = $tree->mainlineNodes();

        $this->assertCount(count($fixture['expectedMainline']), $nodes);

        foreach ($nodes as $i => $node) {
            $expected = $fixture['expectedMainline'][$i];
            $this->assertSame($expected['san'], $node->san, "san mismatch at index $i");
            $this->assertSame($expected['fenFields123'], $this->fenFields123($node->fen), "fen mismatch at index $i");
        }
    }

    // -------------------------------------------------------------------------
    // castling
    // -------------------------------------------------------------------------

    public function testCastlingMatchesFixture(): void
    {
        $fixture = $this->loadFixture('castling.json');
        $tree = $this->buildFromFixture($fixture['inputText']);
        $nodes = $tree->mainlineNodes();

        $this->assertCount(count($fixture['expectedMainline']), $nodes);

        $castleNode = null;
        foreach ($nodes as $n) {
            if ($n->san === 'O-O') {
                $castleNode = $n;
            }
        }
        $this->assertNotNull($castleNode, 'O-O node not found');
        $this->assertSame('e1', $castleNode->from);
        $this->assertSame('g1', $castleNode->to);

        $expectedCastle = null;
        foreach ($fixture['expectedMainline'] as $m) {
            if ($m['san'] === 'O-O') {
                $expectedCastle = $m;
            }
        }
        $this->assertNotNull($expectedCastle);
        $this->assertSame($expectedCastle['fenFields123'], $this->fenFields123($castleNode->fen));
    }

    // -------------------------------------------------------------------------
    // illegal-move
    // -------------------------------------------------------------------------

    public function testIllegalMoveMatchesFixture(): void
    {
        $fixture = $this->loadFixture('illegal-move.json');
        $tree = $this->buildFromFixture($fixture['inputText']);
        $nodes = $tree->mainlineNodes();

        $this->assertCount(count($fixture['expectedMainline']), $nodes);

        $invalidNode = null;
        foreach ($nodes as $n) {
            if ($n->invalid) {
                $invalidNode = $n;
            }
        }
        $this->assertNotNull($invalidNode);

        $expectedInvalid = null;
        foreach ($fixture['expectedMainline'] as $m) {
            if (!empty($m['invalid'])) {
                $expectedInvalid = $m;
            }
        }
        $this->assertNotNull($expectedInvalid);
        $this->assertSame($expectedInvalid['san'], $invalidNode->san);
        $this->assertSame('', $invalidNode->from);
        $this->assertSame('', $invalidNode->to);
    }

    // -------------------------------------------------------------------------
    // with-variation
    // -------------------------------------------------------------------------

    public function testWithVariationMatchesFixture(): void
    {
        $fixture = $this->loadFixture('with-variation.json');
        $tree = $this->buildFromFixture($fixture['inputText']);
        $nodes = $tree->mainlineNodes();

        $expectedSans = array_map(fn($m) => $m['san'], $fixture['expectedMainline']);
        $this->assertSame($expectedSans, array_map(fn($n) => $n->san, $nodes));

        // Variation node d4 exists
        $d4 = null;
        foreach ($tree->getNodes() as $n) {
            if ($n->san === 'd4') $d4 = $n;
        }
        $this->assertNotNull($d4, 'd4 variation node not found');
        $this->assertSame(
            $fixture['expectedVariationMoves'][0]['fenFields123'],
            $this->fenFields123($d4->fen)
        );
    }

    // -------------------------------------------------------------------------
    // nested-variation
    // -------------------------------------------------------------------------

    public function testNestedVariationMatchesFixture(): void
    {
        $fixture = $this->loadFixture('nested-variation.json');
        $tree = $this->buildFromFixture($fixture['inputText']);

        // Mainline intact
        $nodes = $tree->mainlineNodes();
        $expectedSans = array_map(fn($m) => $m['san'], $fixture['expectedMainline']);
        $this->assertSame($expectedSans, array_map(fn($n) => $n->san, $nodes));

        // Outer variation d4
        $d4 = null;
        foreach ($tree->getNodes() as $n) {
            if ($n->san === 'd4') $d4 = $n;
        }
        $this->assertNotNull($d4);
        $this->assertSame($fixture['outerVariation']['fenFields123'], $this->fenFields123($d4->fen));

        // Inner variation c4
        $c4 = null;
        foreach ($tree->getNodes() as $n) {
            if ($n->san === 'c4') $c4 = $n;
        }
        $this->assertNotNull($c4);
        $this->assertSame($fixture['innerVariation']['fenFields123'], $this->fenFields123($c4->fen));
    }
}

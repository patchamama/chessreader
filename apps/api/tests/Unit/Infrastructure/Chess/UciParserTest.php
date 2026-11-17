<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Chess;

use App\Infrastructure\Chess\Engine\UciParser;
use PHPUnit\Framework\TestCase;

/**
 * Tests for the UCI output parser — NO binary required, feeds canned strings.
 */
class UciParserTest extends TestCase
{
    private UciParser $parser;

    protected function setUp(): void
    {
        $this->parser = new UciParser();
    }

    public function test_parses_cp_score_and_bestmove(): void
    {
        $lines = [
            'info depth 20 seldepth 25 multipv 1 score cp 34 nodes 123456 nps 500000 time 246 pv e2e4 e7e5 g1f3',
            'bestmove e2e4 ponder e7e5',
        ];

        $eval = $this->parser->parse($lines);

        $this->assertSame(34, $eval->scoreCp);
        $this->assertNull($eval->mate);
        $this->assertSame('e2e4', $eval->bestMove);
        $this->assertSame(20, $eval->depth);
    }

    public function test_parses_mate_score(): void
    {
        $lines = [
            'info depth 5 score mate 3 pv d1h5 f7f6 h5f3',
            'bestmove d1h5 ponder f7f6',
        ];

        $eval = $this->parser->parse($lines);

        $this->assertNull($eval->scoreCp);
        $this->assertSame(3, $eval->mate);
        $this->assertSame('d1h5', $eval->bestMove);
        $this->assertSame(5, $eval->depth);
    }

    public function test_parses_negative_mate(): void
    {
        $lines = [
            'info depth 3 score mate -2 pv a1a2',
            'bestmove a1a2',
        ];

        $eval = $this->parser->parse($lines);

        $this->assertSame(-2, $eval->mate);
    }

    public function test_parses_bestmove_without_ponder(): void
    {
        $lines = [
            'info depth 1 score cp 0 pv e2e4',
            'bestmove e2e4',
        ];

        $eval = $this->parser->parse($lines);

        $this->assertSame('e2e4', $eval->bestMove);
    }

    public function test_uses_last_info_line(): void
    {
        // Engine emits multiple info lines; last before bestmove wins
        $lines = [
            'info depth 1 score cp 10 pv e2e4',
            'info depth 5 score cp 25 pv e2e4',
            'info depth 10 score cp 34 pv e2e4',
            'bestmove e2e4',
        ];

        $eval = $this->parser->parse($lines);

        $this->assertSame(34, $eval->scoreCp);
        $this->assertSame(10, $eval->depth);
    }

    public function test_throws_on_empty_output(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->parser->parse([]);
    }

    public function test_captures_pv_line_from_last_info(): void
    {
        $lines = [
            'info depth 5 score cp 10 pv e2e4 e7e5',
            'info depth 20 score cp 34 pv e2e4 e7e5 g1f3 b8c6',
            'bestmove e2e4 ponder e7e5',
        ];

        $eval = $this->parser->parse($lines);

        $this->assertSame(['e2e4', 'e7e5', 'g1f3', 'b8c6'], $eval->pv);
    }

    public function test_pv_is_null_when_info_has_no_pv_token(): void
    {
        $lines = [
            'info depth 1 score cp 0',
            'bestmove e2e4',
        ];

        $eval = $this->parser->parse($lines);

        $this->assertNull($eval->pv);
    }

    public function test_captures_engine_name_from_id_line(): void
    {
        $lines = [
            'id name Stockfish 18',
            'id author the Stockfish developers',
            'uciok',
            'info depth 20 score cp 34 pv e2e4',
            'bestmove e2e4',
        ];

        $eval = $this->parser->parse($lines);

        $this->assertSame('Stockfish 18', $eval->engineName);
    }

    public function test_parses_the_lines_of_a_multipv_search_each_at_its_deepest_depth(): void
    {
        $lines = [
            'info depth 11 seldepth 14 multipv 1 score cp 30 nodes 1 nps 1 time 1 pv e2e4 e7e5',
            'info depth 11 seldepth 14 multipv 2 score cp 25 nodes 1 nps 1 time 1 pv d2d4 d7d5',
            'info depth 11 seldepth 14 multipv 3 score cp 20 nodes 1 nps 1 time 1 pv g1f3 g8f6',
            'info depth 12 seldepth 15 multipv 1 score cp 34 nodes 2 nps 1 time 2 pv e2e4 c7c5 g1f3',
            'info depth 12 seldepth 15 multipv 2 score mate 7 nodes 2 nps 1 time 2 pv d2d4 g8f6',
            'bestmove e2e4 ponder c7c5',
        ];
        $evals = $this->parser->parseLines(array_merge(['id name Stockfish 19'], $lines));
        self::assertCount(3, $evals);
        self::assertSame([20, 11], [$evals[2]->scoreCp, $evals[2]->depth]);
        self::assertSame([34, 12, ['e2e4', 'c7c5', 'g1f3'], 'Stockfish 19'], [$evals[0]->scoreCp, $evals[0]->depth, $evals[0]->pv, $evals[0]->engineName]);
        self::assertSame([7, 'd2d4'], [$evals[1]->mate, $evals[1]->bestMove]);
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Engine;

use App\Application\Eval\Port\ChessEngine;
use App\Application\Eval\Port\MultiLineEngine;
use App\Domain\Chess\Evaluation;
use App\Domain\Chess\Fen;

/**
 * Production ChessEngine implementation using a native Stockfish binary via UCI.
 */
final class UciStockfishEngine implements ChessEngine, MultiLineEngine
{
    private readonly UciParser $parser;

    public function __construct(private readonly string $binaryPath)
    {
        $this->parser = new UciParser();
    }

    public function evaluate(Fen $fen, int $depth): Evaluation
    {
        $process = new StockfishProcess($this->binaryPath);
        $process->start();

        try {
            $process->send('ucinewgame');
            $process->send('position fen ' . $fen->value());
            $process->send("go depth {$depth}");

            $lines = $process->readUntil('bestmove');
        } finally {
            $process->stop();
        }

        // The `id name …` line arrives during the UCI handshake (consumed before
        // `go`), so re-inject it here for the parser to pick up the engine version.
        $engineName = $process->engineName();
        if ($engineName !== null) {
            array_unshift($lines, 'id name ' . $engineName);
        }

        return $this->parser->parse($lines);
    }

    public function evaluateLines(Fen $fen, int $depth, int $count): array
    {
        $process = new StockfishProcess($this->binaryPath);
        $process->start();
        try {
            $process->send('setoption name MultiPV value ' . max(1, min(5, $count)));
            $process->send('ucinewgame');
            $process->send('position fen ' . $fen->value());
            $process->send("go depth {$depth}");
            $lines = $process->readUntil('bestmove');
        } finally {
            $process->stop();
        }
        $engineName = $process->engineName();
        if ($engineName !== null) {
            array_unshift($lines, 'id name ' . $engineName);
        }
        return $this->parser->parseLines($lines);
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Engine\Port;

use App\Domain\Chess\Fen;

/** Engines on the server that can play a game (Stockfish, Maia nets, GNU Chess…). */
interface PlayingEngines
{
    /** @return list<array{id: string, name: string, style: string}> */
    public function list(): array;

    /** The engine's move (UCI) in a position; `level` 1–8 sets its time or strength. */
    public function move(string $engineId, Fen $fen, int $level): ?string;
}

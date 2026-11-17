<?php

declare(strict_types=1);

namespace App\Application\Eval\Port;

use App\Domain\Chess\Evaluation;
use App\Domain\Chess\Fen;

/** An engine that can give its best `count` lines of a position (MultiPV), best first. */
interface MultiLineEngine
{
    /** @return list<Evaluation> */
    public function evaluateLines(Fen $fen, int $depth, int $count): array;
}

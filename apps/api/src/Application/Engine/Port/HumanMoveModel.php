<?php

declare(strict_types=1);

namespace App\Application\Engine\Port;

use App\Domain\Chess\Fen;

/** A model of how people play (Maia): the moves a player of a rating would choose, most likely first. */
interface HumanMoveModel
{
    /** @return list<int> Ratings available (none: the model is not installed). */
    public function ratings(): array;

    /**
     * @return array{rating: int, moves: list<array{uci: string, probability: float}>}
     */
    public function predict(Fen $fen, int $rating, int $limit): array;
}

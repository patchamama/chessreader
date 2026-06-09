<?php

declare(strict_types=1);

namespace App\Domain\Chess;

/**
 * A node in the GameTree — represents a single chess move with its resulting position.
 */
final class GameNode
{
    public function __construct(
        public readonly string $id,
        public readonly string $san,
        public readonly string $fen,
        public readonly string $from,
        public readonly string $to,
        public readonly int $moveNumber,
        public readonly string $color,   // 'white' | 'black'
        public readonly ?string $parentId,
        public readonly bool $invalid = false,
    ) {
    }

    public function toArray(): array
    {
        $data = [
            'id'         => $this->id,
            'san'        => $this->san,
            'fen'        => $this->fen,
            'from'       => $this->from,
            'to'         => $this->to,
            'moveNumber' => $this->moveNumber,
            'color'      => $this->color,
            'parentId'   => $this->parentId,
        ];
        if ($this->invalid) {
            $data['invalid'] = true;
        }
        return $data;
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Chess;

/**
 * A game fragment recognised in a chapter text.
 */
final class RecognizedGame
{
    public function __construct(
        public readonly int $charStart,
        public readonly int $charEnd,
        public readonly string $source,
        public readonly GameTree $tree,
    ) {
    }

    public function toArray(): array
    {
        return [
            'charStart' => $this->charStart,
            'charEnd'   => $this->charEnd,
            'source'    => $this->source,
            'tree'      => $this->tree->toArray(),
        ];
    }
}

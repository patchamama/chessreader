<?php

declare(strict_types=1);

namespace App\Application\Narration;

final class RenderedNarration
{
    /** @param list<float> $durations seconds of each segment, in order */
    public function __construct(
        public readonly string $id,
        public readonly array $durations,
        public readonly float $total,
    ) {
    }
}

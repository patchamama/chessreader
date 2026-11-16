<?php

declare(strict_types=1);

namespace App\Application\Narration;

final class RenderNarrationCommand
{
    /** @param list<string> $segments what is said, one entry per audio segment */
    public function __construct(
        public readonly array $segments,
        public readonly string $lang,
        public readonly VoiceOptions $voice,
        public readonly float $gapSeconds,
    ) {
    }
}

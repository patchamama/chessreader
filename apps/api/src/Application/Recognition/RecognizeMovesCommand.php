<?php

declare(strict_types=1);

namespace App\Application\Recognition;

final class RecognizeMovesCommand
{
    public function __construct(
        public readonly string $text,
    ) {
    }
}

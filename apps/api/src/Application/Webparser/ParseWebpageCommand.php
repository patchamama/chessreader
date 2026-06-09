<?php

declare(strict_types=1);

namespace App\Application\Webparser;

final class ParseWebpageCommand
{
    public function __construct(
        public readonly string $url,
    ) {
    }
}

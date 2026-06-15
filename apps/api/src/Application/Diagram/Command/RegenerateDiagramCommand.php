<?php

declare(strict_types=1);

namespace App\Application\Diagram\Command;

use App\Application\Diagram\DiagramRenderOptions;

final class RegenerateDiagramCommand
{
    public function __construct(
        public readonly string  $fenValue,
        public readonly ?string $filename,
        public readonly int     $depth,
        public readonly bool    $exportPng,
        public readonly ?DiagramRenderOptions $options = null,
    ) {
    }
}

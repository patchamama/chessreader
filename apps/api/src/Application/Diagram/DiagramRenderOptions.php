<?php

declare(strict_types=1);

namespace App\Application\Diagram;

/**
 * Visual options for rendering a board diagram. All optional: when a field is
 * null the renderer falls back to its built-in default (classic colors / merida
 * pieces / no coordinates).
 */
final class DiagramRenderOptions
{
    public function __construct(
        public readonly ?string $lightColor = null,
        public readonly ?string $darkColor = null,
        public readonly ?string $pieceSet = null,
        public readonly bool $coordinates = false,
    ) {
    }

    public static function default(): self
    {
        return new self();
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Recognition;

/**
 * Represents a token found while scanning text for chess moves.
 */
final class SanToken
{
    public const TYPE_MOVE_NUMBER    = 'move-number';
    public const TYPE_MOVE           = 'move';
    public const TYPE_VARIATION_OPEN  = 'variation-open';
    public const TYPE_VARIATION_CLOSE = 'variation-close';
    public const TYPE_RESULT         = 'result';

    public function __construct(
        public readonly string $type,
        public readonly string $raw,
        public readonly int $charStart,
        public readonly int $charEnd,
        public readonly ?int $moveNumber = null,
        public readonly bool $isEllipsis = false,
        public readonly ?string $color = null,   // 'white' | 'black'
        public readonly ?string $san = null,
    ) {
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Chess;

/**
 * Value object representing a FEN (Forsyth–Edwards Notation) position string.
 */
final class Fen
{
    public const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    private function __construct(private readonly string $value)
    {
    }

    public static function fromString(string $fen): self
    {
        return new self(trim($fen));
    }

    public static function start(): self
    {
        return new self(self::STANDARD_START);
    }

    public function value(): string
    {
        return $this->value;
    }

    /**
     * Returns the first 3 fields of the FEN (board + active + castling).
     * Used for golden fixture comparison (avoids EP square divergence between chess engines).
     */
    public function fields123(): string
    {
        $parts = explode(' ', $this->value);
        return implode(' ', array_slice($parts, 0, 3));
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }

    public function __toString(): string
    {
        return $this->value;
    }
}

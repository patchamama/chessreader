<?php

declare(strict_types=1);

namespace App\Domain\Chess;

/**
 * Value object representing a SAN (Standard Algebraic Notation) move string.
 */
final class San
{
    private function __construct(private readonly string $value)
    {
    }

    public static function fromString(string $san): self
    {
        return new self(trim($san));
    }

    public function value(): string
    {
        return $this->value;
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

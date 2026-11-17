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

    /**
     * A FEN as given. Control characters (new lines above all) become spaces:
     * a FEN is written to an engine's input, where a new line would start
     * another engine command.
     */
    public static function fromString(string $fen): self
    {
        return new self(trim((string) preg_replace('/[\x00-\x1F\x7F]+/', ' ', $fen)));
    }

    /** Whether text from outside looks like a FEN: eight ranks of eight squares, side, castling, en passant, counters. */
    public static function isWellFormed(string $fen): bool
    {
        if (preg_match('/[\x00-\x1F\x7F]/', $fen)) {
            return false;
        }
        if (!preg_match('/^([pnbrqkPNBRQK1-8]+(?:\/[pnbrqkPNBRQK1-8]+){7}) [wb] (-|K?Q?k?q?) (-|[a-h][36])(?: \d{1,3} \d{1,4})?$/', trim($fen), $m)) {
            return false;
        }
        foreach (explode('/', $m[1]) as $rank) {
            $squares = 0;
            foreach (str_split($rank) as $ch) {
                $squares += ctype_digit($ch) ? (int) $ch : 1;
            }
            if ($squares !== 8) {
                return false;
            }
        }
        return true;
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

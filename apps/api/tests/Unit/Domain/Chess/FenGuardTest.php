<?php

declare(strict_types=1);

namespace App\Tests\Unit\Domain\Chess;

use App\Domain\Chess\Fen;
use PHPUnit\Framework\TestCase;

final class FenGuardTest extends TestCase
{
    public function test_control_characters_never_survive_in_a_fen(): void
    {
        self::assertSame('8/8/8/8/8/8/8/K6k w - - 0 1 setoption name LogFile value x', Fen::fromString("8/8/8/8/8/8/8/K6k w - - 0 1\nsetoption name LogFile value x")->value());
    }

    public function test_tells_a_well_formed_fen(): void
    {
        self::assertTrue(Fen::isWellFormed('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'));
        self::assertTrue(Fen::isWellFormed('8/8/8/8/8/8/8/K6k w - -'));
        self::assertFalse(Fen::isWellFormed("8/8/8/8/8/8/8/K6k w - - 0 1\ngo infinite"));
        self::assertFalse(Fen::isWellFormed('8/8/8/8 w - - 0 1'));
        self::assertFalse(Fen::isWellFormed('rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
    }
}

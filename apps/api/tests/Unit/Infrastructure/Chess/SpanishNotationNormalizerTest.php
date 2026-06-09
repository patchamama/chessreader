<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Chess;

use App\Infrastructure\Chess\Recognition\SpanishNotationNormalizer;
use PHPUnit\Framework\TestCase;

class SpanishNotationNormalizerTest extends TestCase
{
    private SpanishNotationNormalizer $normalizer;

    protected function setUp(): void
    {
        $this->normalizer = new SpanishNotationNormalizer();
    }

    /** @dataProvider tokenProvider */
    public function testNormalizeToken(string $input, string $expected): void
    {
        $this->assertSame($expected, $this->normalizer->normalizeToken($input));
    }

    public static function tokenProvider(): array
    {
        return [
            'Knight C->N'        => ['Cf3', 'Nf3'],
            'Knight capture'     => ['Cxd5', 'Nxd5'],
            'Bishop A->B'        => ['Ae2', 'Be2'],
            'Bishop capture'     => ['Axf7', 'Bxf7'],
            'Queen D->Q'         => ['Dd5', 'Qd5'],
            'Queen capture'      => ['Dxd5', 'Qxd5'],
            'Rook T->R'          => ['Tf1', 'Rf1'],
            'Rook capture'       => ['Txe5', 'Rxe5'],
            'King R->K'          => ['Re1', 'Ke1'],
            'King capture'       => ['Rxe5', 'Kxe5'],
            'castling 0-0->O-O'  => ['0-0', 'O-O'],
            'castling 0-0-0->O-O-O' => ['0-0-0', 'O-O-O'],
            'O-O unchanged'      => ['O-O', 'O-O'],
            'pawn unchanged'     => ['e4', 'e4'],
            'pawn capture'       => ['exd5', 'exd5'],
            'promotion'          => ['e8=Q', 'e8=Q'],
        ];
    }

    public function testTTokenDoesNotBecomeKAfterReplacement(): void
    {
        // T->R (Rook), NOT K — the R->K substitution must not apply to T-derived Rs
        $this->assertSame('Rf1', $this->normalizer->normalizeToken('Tf1'));
        $this->assertSame('Ke1', $this->normalizer->normalizeToken('Re1'));
    }

    public function testNormalizeText(): void
    {
        $input = '1. e4 e5 2. Cf3 Cc6 3. Ac4';
        $result = $this->normalizer->normalizeText($input);
        $this->assertSame('1. e4 e5 2. Nf3 Nc6 3. Bc4', $result);
    }

    public function testNormalizeTextCastling(): void
    {
        $this->assertStringContainsString('O-O', $this->normalizer->normalizeText('4. 0-0'));
        $this->assertStringContainsString('O-O-O', $this->normalizer->normalizeText('4. 0-0-0'));
    }

    public function testNormalizeTextEllipsis(): void
    {
        $result = $this->normalizer->normalizeText('2… Nc6');
        $this->assertStringContainsString('...', $result);
    }

    public function testTorreToRookWithoutClobberingKing(): void
    {
        $input = '10. Tf1 Re1';
        $result = $this->normalizer->normalizeText($input);
        $this->assertStringContainsString('Rf1', $result);
        $this->assertStringContainsString('Ke1', $result);
    }
}

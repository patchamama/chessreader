<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Engine;

use App\Application\Engine\StockfishAssetPicker;
use PHPUnit\Framework\TestCase;

final class StockfishAssetPickerTest extends TestCase
{
    private const SF19 = [
        'stockfish-android-arm64-universal.tar.gz', 'stockfish-linux-arm64-universal.tar.gz', 'stockfish-linux-x86-64-universal.tar.gz',
        'stockfish-macos-universal.tar.gz', 'stockfish-windows-arm64-universal.zip', 'stockfish-windows-x86-64-universal.zip',
    ];
    private const SF17 = [
        'stockfish-android-armv8.tar', 'stockfish-macos-m1-apple-silicon.tar', 'stockfish-macos-x86-64-avx2.tar', 'stockfish-macos-x86-64.tar',
        'stockfish-ubuntu-x86-64-avx2.tar', 'stockfish-ubuntu-x86-64-avx512.tar', 'stockfish-ubuntu-x86-64.tar', 'stockfish-windows-x86-64-avx2.zip',
    ];

    public function test_picks_the_universal_build_of_the_platform_in_new_releases(): void
    {
        self::assertSame('stockfish-macos-universal.tar.gz', StockfishAssetPicker::pick(self::SF19, 'Darwin', 'arm64'));
        self::assertSame('stockfish-linux-x86-64-universal.tar.gz', StockfishAssetPicker::pick(self::SF19, 'Linux', 'x86_64'));
        self::assertSame('stockfish-linux-arm64-universal.tar.gz', StockfishAssetPicker::pick(self::SF19, 'Linux', 'aarch64'));
        self::assertSame('stockfish-windows-x86-64-universal.zip', StockfishAssetPicker::pick(self::SF19, 'Windows', 'AMD64'));
    }

    public function test_picks_a_safe_build_in_older_releases(): void
    {
        self::assertSame('stockfish-macos-m1-apple-silicon.tar', StockfishAssetPicker::pick(self::SF17, 'Darwin', 'arm64'));
        self::assertSame('stockfish-macos-x86-64-avx2.tar', StockfishAssetPicker::pick(self::SF17, 'Darwin', 'x86_64'));
        // Linux was called "ubuntu"; avx2 runs on almost every x86-64 server, avx512 does not
        self::assertSame('stockfish-ubuntu-x86-64-avx2.tar', StockfishAssetPicker::pick(self::SF17, 'Linux', 'x86_64'));
    }

    public function test_no_build_for_the_platform_gives_null(): void
    {
        self::assertNull(StockfishAssetPicker::pick(self::SF17, 'Linux', 'aarch64'));
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Engine\Port;

/** The published Stockfish releases, newest first. */
interface StockfishReleases
{
    /**
     * @return list<array{tag: string, name: string, publishedAt: string, prerelease: bool, assets: list<array{name: string, url: string}>}>
     */
    public function releases(): array;
}

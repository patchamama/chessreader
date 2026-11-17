<?php

declare(strict_types=1);

namespace App\Application\Engine\Port;

/** The Stockfish versions downloaded on this server, and the one in use. */
interface StockfishInstallation
{
    /** @return list<string> Release tags installed. */
    public function installed(): array;

    /** Download a release build and install it under its tag. */
    public function install(string $tag, string $url, string $assetName): void;

    /** The tag chosen, or null for the system binary. */
    public function selected(): ?string;

    public function select(?string $tag): void;

    public function binaryFor(string $tag): ?string;
}

<?php

declare(strict_types=1);

namespace App\Application\Engine;

use App\Application\Engine\Port\StockfishInstallation;
use App\Application\Engine\Port\StockfishReleases;

/**
 * Which Stockfish the server runs: the latest release (checked on GitHub), the
 * releases that can be downloaded, the ones installed, and the one chosen —
 * the system binary until another is chosen.
 */
final class StockfishVersions
{
    public function __construct(
        private readonly StockfishReleases $releases,
        private readonly StockfishInstallation $installation,
        private readonly ?string $systemBinary,
        private readonly string $os,
        private readonly string $arch,
    ) {
    }

    /** @return array<string, mixed> */
    public function status(): array
    {
        $releases = $this->releases->releases();
        $stable = array_values(array_filter($releases, fn(array $r) => !$r['prerelease']));
        $latest = $stable[0] ?? $releases[0] ?? null;
        $installed = $this->installation->installed();
        return [
            'latest' => $latest === null ? null : $this->summary($latest),
            'latestInstalled' => $latest !== null && in_array($latest['tag'], $installed, true),
            'releases' => array_map(fn(array $r) => $this->summary($r), $releases),
            'installed' => $installed,
            'selected' => $this->installation->selected() ?? 'system',
            'system' => $this->systemBinary,
        ];
    }

    /** Download a release (only one GitHub lists) with the build of this platform. */
    public function install(string $tag): void
    {
        $release = $this->release($tag);
        $names = array_column($release['assets'], 'name');
        $asset = StockfishAssetPicker::pick($names, $this->os, $this->arch);
        if ($asset === null) {
            throw new \InvalidArgumentException("Stockfish {$tag} has no build for {$this->os} {$this->arch}.");
        }
        $url = $release['assets'][array_search($asset, $names, true)]['url'];
        $this->installation->install($tag, $url, $asset);
    }

    /** Choose an installed version, or 'system' for the binary found on the server. */
    public function select(string $tag): void
    {
        if ($tag === 'system') {
            $this->installation->select(null);
            return;
        }
        if (!in_array($tag, $this->installation->installed(), true)) {
            throw new \InvalidArgumentException("Stockfish {$tag} is not installed.");
        }
        $this->installation->select($tag);
    }

    /** The binary the engine should run. */
    public function activeBinary(): ?string
    {
        $tag = $this->installation->selected();
        $chosen = $tag !== null ? $this->installation->binaryFor($tag) : null;
        return $chosen ?? $this->systemBinary;
    }

    /** @return array{tag: string, name: string, publishedAt: string, prerelease: bool, available: bool} */
    private function summary(array $r): array
    {
        return [
            'tag' => $r['tag'], 'name' => $r['name'], 'publishedAt' => $r['publishedAt'], 'prerelease' => $r['prerelease'],
            'available' => StockfishAssetPicker::pick(array_column($r['assets'], 'name'), $this->os, $this->arch) !== null,
        ];
    }

    /** @return array{tag: string, name: string, publishedAt: string, prerelease: bool, assets: list<array{name: string, url: string}>} */
    private function release(string $tag): array
    {
        foreach ($this->releases->releases() as $r) {
            if ($r['tag'] === $tag) {
                return $r;
            }
        }
        throw new \InvalidArgumentException("Unknown Stockfish release: {$tag}");
    }
}

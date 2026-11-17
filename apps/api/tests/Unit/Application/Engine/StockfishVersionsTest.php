<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Engine;

use App\Application\Engine\Port\StockfishInstallation;
use App\Application\Engine\Port\StockfishReleases;
use App\Application\Engine\StockfishVersions;
use PHPUnit\Framework\TestCase;

final class StockfishVersionsTest extends TestCase
{
    private function releases(): StockfishReleases
    {
        return new class implements StockfishReleases {
            public function releases(): array
            {
                $asset = fn(string $n) => ['name' => $n, 'url' => "https://github.com/official-stockfish/Stockfish/releases/download/x/{$n}"];
                return [
                    ['tag' => 'stockfish-dev-20261115', 'name' => 'Stockfish dev-20261115', 'publishedAt' => '2026-11-15', 'prerelease' => true, 'assets' => [$asset('stockfish-macos-universal.tar.gz')]],
                    ['tag' => 'sf_19', 'name' => 'Stockfish 19', 'publishedAt' => '2026-09-05', 'prerelease' => false, 'assets' => [$asset('stockfish-macos-universal.tar.gz'), $asset('stockfish-linux-x86-64-universal.tar.gz')]],
                    ['tag' => 'sf_18', 'name' => 'Stockfish 18', 'publishedAt' => '2026-01-31', 'prerelease' => false, 'assets' => [$asset('stockfish-macos-universal.tar.gz')]],
                ];
            }
        };
    }

    private function installation(): StockfishInstallation
    {
        return new class implements StockfishInstallation {
            /** @var array<string, string> */
            public array $installed = ['sf_18' => '/s/sf_18/stockfish'];
            public ?string $selected = null;
            public array $calls = [];
            public function installed(): array { return array_keys($this->installed); }
            public function install(string $tag, string $url, string $assetName): void { $this->calls[] = [$tag, $url, $assetName]; $this->installed[$tag] = "/s/{$tag}/stockfish"; }
            public function selected(): ?string { return $this->selected; }
            public function select(?string $tag): void { $this->selected = $tag; }
            public function binaryFor(string $tag): ?string { return $this->installed[$tag] ?? null; }
        };
    }

    private function service(StockfishInstallation $inst, ?string $system = '/opt/homebrew/bin/stockfish'): StockfishVersions
    {
        return new StockfishVersions($this->releases(), $inst, $system, 'Darwin', 'arm64');
    }

    public function test_status_names_the_latest_stable_release_the_ones_available_installed_and_selected(): void
    {
        $status = $this->service($this->installation())->status();
        self::assertSame('sf_19', $status['latest']['tag']);
        self::assertSame(['stockfish-dev-20261115', 'sf_19', 'sf_18'], array_column($status['releases'], 'tag'));
        self::assertSame(['sf_18'], $status['installed']);
        self::assertSame('system', $status['selected']); // nothing chosen: the system binary
        self::assertSame('/opt/homebrew/bin/stockfish', $status['system']);
        self::assertFalse($status['latestInstalled']);
    }

    public function test_installs_a_release_with_the_build_of_this_platform(): void
    {
        $inst = $this->installation();
        $this->service($inst)->install('sf_19');
        self::assertSame([['sf_19', 'https://github.com/official-stockfish/Stockfish/releases/download/x/stockfish-macos-universal.tar.gz', 'stockfish-macos-universal.tar.gz']], $inst->calls);
    }

    public function test_refuses_a_tag_that_is_not_a_release(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->service($this->installation())->install('sf_19; rm -rf /');
    }

    public function test_selects_an_installed_version_or_the_system_one(): void
    {
        $inst = $this->installation();
        $s = $this->service($inst);
        $s->select('sf_18');
        self::assertSame('sf_18', $inst->selected);
        self::assertSame('/s/sf_18/stockfish', $s->activeBinary());
        $s->select('system');
        self::assertNull($inst->selected);
        self::assertSame('/opt/homebrew/bin/stockfish', $s->activeBinary());
    }

    public function test_cannot_select_a_version_that_is_not_installed(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->service($this->installation())->select('sf_19');
    }
}

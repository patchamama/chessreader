<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Engine;

use App\Application\Engine\Port\StockfishInstallation;

/**
 * Stockfish versions under storage/stockfish/<tag>/stockfish, and the chosen
 * one in storage/stockfish/selected.txt.
 */
final class FilesystemStockfishInstallation implements StockfishInstallation
{
    public function __construct(private readonly string $dir)
    {
    }

    public function installed(): array
    {
        $tags = [];
        foreach (glob(rtrim($this->dir, '/') . '/*/stockfish') ?: [] as $bin) {
            if (is_executable($bin)) {
                $tags[] = basename(dirname($bin));
            }
        }
        rsort($tags);
        return $tags;
    }

    public function install(string $tag, string $url, string $assetName): void
    {
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]*$/', $tag) || !str_starts_with($url, 'https://github.com/official-stockfish/')) {
            throw new \InvalidArgumentException('Not a Stockfish release download.');
        }
        $target = rtrim($this->dir, '/') . "/{$tag}";
        $tmp = $target . '.tmp';
        shell_exec('rm -rf ' . escapeshellarg($tmp));
        mkdir($tmp, 0755, true);
        $archive = "{$tmp}/" . basename($assetName);
        $in = @fopen($url, 'r');
        if ($in === false || file_put_contents($archive, $in) === false) {
            throw new \RuntimeException("Could not download {$url}");
        }
        $cmd = str_ends_with($archive, '.zip')
            ? 'unzip -q ' . escapeshellarg($archive) . ' -d ' . escapeshellarg($tmp)
            : 'tar -xf ' . escapeshellarg($archive) . ' -C ' . escapeshellarg($tmp);
        shell_exec($cmd . ' 2>&1');
        $binary = $this->findBinary($tmp);
        if ($binary === null) {
            throw new \RuntimeException('No Stockfish program in the downloaded archive.');
        }
        @mkdir($target, 0755, true);
        copy($binary, "{$target}/stockfish");
        chmod("{$target}/stockfish", 0755);
        shell_exec('rm -rf ' . escapeshellarg($tmp));
    }

    public function selected(): ?string
    {
        $file = rtrim($this->dir, '/') . '/selected.txt';
        $tag = is_file($file) ? trim((string) file_get_contents($file)) : '';
        return $tag !== '' && $this->binaryFor($tag) !== null ? $tag : null;
    }

    public function select(?string $tag): void
    {
        @mkdir($this->dir, 0755, true);
        file_put_contents(rtrim($this->dir, '/') . '/selected.txt', $tag ?? '');
    }

    public function binaryFor(string $tag): ?string
    {
        $bin = rtrim($this->dir, '/') . "/{$tag}/stockfish";
        return preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]*$/', $tag) && is_file($bin) && is_executable($bin) ? $bin : null;
    }

    /** The engine program in an unpacked release: an executable file named stockfish… (not sources or docs). */
    private function findBinary(string $dir): ?string
    {
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $file) {
            $name = $file->getFilename();
            // A link in the archive is never taken for the engine.
            if (!$file->isLink() && $file->isFile() && preg_match('/^stockfish[^.\/]*(\.exe)?$/i', $name) && $file->getSize() > 1_000_000) {
                return $file->getPathname();
            }
        }
        return null;
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Engine;

use App\Application\Engine\Port\StockfishReleases;
use GuzzleHttp\Client;

/**
 * Stockfish releases from the GitHub API, kept for a day in a cache file so
 * every page load does not ask GitHub (which limits anonymous calls). When
 * GitHub cannot be reached the last list is used.
 */
final class GithubStockfishReleases implements StockfishReleases
{
    private const URL = 'https://api.github.com/repos/official-stockfish/Stockfish/releases?per_page=8';
    private const TTL = 86400;

    public function __construct(private readonly string $cacheFile, private readonly ?Client $http = null)
    {
    }

    public function releases(): array
    {
        $cached = is_file($this->cacheFile) ? json_decode((string) file_get_contents($this->cacheFile), true) : null;
        if (is_array($cached) && time() - (int) ($cached['at'] ?? 0) < self::TTL) {
            return $cached['releases'];
        }
        try {
            $http = $this->http ?? new Client(['timeout' => 10]);
            $body = (string) $http->get(self::URL, ['headers' => ['Accept' => 'application/vnd.github+json', 'User-Agent' => 'chessreader']])->getBody();
            $releases = array_map(fn(array $r) => [
                'tag' => (string) $r['tag_name'],
                'name' => (string) ($r['name'] ?: $r['tag_name']),
                'publishedAt' => (string) ($r['published_at'] ?? ''),
                'prerelease' => (bool) ($r['prerelease'] ?? false),
                'assets' => array_map(fn(array $a) => ['name' => (string) $a['name'], 'url' => (string) $a['browser_download_url']], $r['assets'] ?? []),
            ], json_decode($body, true) ?: []);
            @mkdir(dirname($this->cacheFile), 0755, true);
            file_put_contents($this->cacheFile, json_encode(['at' => time(), 'releases' => $releases]));
            return $releases;
        } catch (\Throwable) {
            return is_array($cached) ? $cached['releases'] : [];
        }
    }
}

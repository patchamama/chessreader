<?php

declare(strict_types=1);

namespace App\Presentation\Library;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * The last computed numbers of a book (games, main-line plies, variations,
 * comments, errors), kept as book-stats.<id>.json under the storage directory.
 * The reader's browser computes them (it holds the recogniser) and saves them
 * here, so every device shows them without recomputing.
 */
final class BookStatsController
{
    private const COUNTS = ['games', 'plies', 'variations', 'comments', 'errors'];
    private const MAX_COUNT = 100_000_000;

    public function __construct(private readonly string $storageDir) {}

    public function get(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        $file = $this->fileFor($id);
        $stats = null;
        if (is_file($file)) {
            $saved = json_decode((string) file_get_contents($file), true);
            $stats = is_array($saved) ? $saved : null;
        }
        return $this->json($response, ['stats' => $stats]);
    }

    public function save(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        $body = json_decode((string) $request->getBody(), true);
        $stats = is_array($body) ? $this->validated($body) : null;
        if ($stats === null) {
            return $this->json($response, ['error' => 'Invalid book stats'], 400);
        }
        if (!is_dir($this->storageDir)) {
            @mkdir($this->storageDir, 0775, true);
        }
        $file = $this->fileFor($id);
        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($tmp, json_encode($stats)) === false || !@rename($tmp, $file)) {
            @unlink($tmp);
            return $this->json($response, ['error' => 'Failed to save book stats'], 500);
        }
        return $this->json($response, ['ok' => true, 'stats' => $stats]);
    }

    /** @return array<string, int|string>|null only the known fields, each of the right type; null when any is not */
    private function validated(array $body): ?array
    {
        $out = [];
        foreach (self::COUNTS as $key) {
            $n = $body[$key] ?? null;
            if (!is_int($n) || $n < 0 || $n > self::MAX_COUNT) {
                return null;
            }
            $out[$key] = $n;
        }
        foreach (['analysedAt' => 40, 'version' => 20] as $key => $max) {
            $s = $body[$key] ?? null;
            if (!is_string($s) || $s === '' || strlen($s) > $max) {
                return null;
            }
            $out[$key] = $s;
        }
        return $out;
    }

    private function fileFor(int $id): string
    {
        return rtrim($this->storageDir, '/') . "/book-stats.{$id}.json";
    }

    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write(json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

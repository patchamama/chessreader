<?php

declare(strict_types=1);

namespace App\Infrastructure\Studies;

use App\Application\Studies\LichessStudyException;
use App\Application\Studies\LichessStudySource;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\GuzzleException;
use Psr\Http\Message\ResponseInterface;

/**
 * Polite client of the public Lichess study API: sequential, at least 1.5 s between
 * calls, honours 429 + Retry-After. The optional token only ever goes to lichess.org.
 */
final class LichessStudyClient implements LichessStudySource
{
    private const BASE = 'https://lichess.org';
    private const MIN_GAP = 1.5;
    private const MAX_RETRY_AFTER = 60;

    private int $calls = 0;
    /** @var callable(float): void */
    private $sleeper;

    /**
     * @param ?callable(float): void $sleeper seconds to wait (injectable for tests)
     */
    public function __construct(
        private readonly ClientInterface $http,
        ?callable $sleeper = null,
        private readonly string $token = '',
        private readonly string $userAgent = 'chess-ebook-reader study importer (personal library; contact: app owner)',
    ) {
        $this->sleeper = $sleeper ?? static function (float $s): void {
            usleep((int) round($s * 1_000_000));
        };
    }

    public function exportPgn(string $id): string
    {
        if (!preg_match('/^[A-Za-z0-9]{8}$/', $id)) {
            throw new \InvalidArgumentException('invalid study id');
        }
        return (string) $this->get("/api/study/{$id}.pgn", 'application/x-chess-pgn', "study {$id}")->getBody();
    }

    public function listUserStudies(string $handle): array
    {
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,28}$/', $handle)) {
            throw new \InvalidArgumentException('invalid Lichess handle');
        }
        $body = (string) $this->get('/api/study/by/' . $handle, 'application/x-ndjson', "user {$handle}")->getBody();
        $out = [];
        foreach (preg_split('/\R/', $body) ?: [] as $line) {
            $row = trim($line) === '' ? null : json_decode($line, true);
            if (!is_array($row) || !isset($row['id']) || !is_string($row['id'])) {
                continue;
            }
            $out[] = [
                'id' => $row['id'],
                'name' => (string) ($row['name'] ?? $row['id']),
                'createdAt' => self::iso($row['createdAt'] ?? null),
                'updatedAt' => self::iso($row['updatedAt'] ?? null),
            ];
        }
        return $out;
    }

    private function get(string $path, string $accept, string $what): ResponseInterface
    {
        $retried = false;
        while (true) {
            if ($this->calls++ > 0) {
                ($this->sleeper)(self::MIN_GAP);
            }
            $headers = ['User-Agent' => $this->userAgent, 'Accept' => $accept];
            if ($this->token !== '') {
                $headers['Authorization'] = 'Bearer ' . $this->token;
            }
            try {
                $res = $this->http->request('GET', self::BASE . $path, ['headers' => $headers, 'http_errors' => false, 'timeout' => 60]);
            } catch (GuzzleException $e) {
                throw new LichessStudyException(0, "could not reach Lichess for {$what}");
            }
            $status = $res->getStatusCode();
            if ($status === 429) {
                $retryAfter = (int) ($res->getHeaderLine('Retry-After') ?: 60);
                if ($retried) {
                    throw new LichessStudyException(429, "Lichess rate limit reached; retry in {$retryAfter} s", $retryAfter);
                }
                ($this->sleeper)((float) min(self::MAX_RETRY_AFTER, max(1, $retryAfter)));
                $retried = true;
                continue;
            }
            return match (true) {
                $status === 404 => throw new LichessStudyException(404, "{$what} not found"),
                $status === 401, $status === 403 => throw new LichessStudyException($status, "{$what} is private or not accessible"),
                $status >= 400 => throw new LichessStudyException($status, "Lichess answered {$status} for {$what}"),
                default => $res,
            };
        }
    }

    private static function iso(mixed $ms): ?string
    {
        return is_int($ms) || is_float($ms) ? gmdate('Y-m-d\TH:i:s\Z', (int) floor($ms / 1000)) : null;
    }
}

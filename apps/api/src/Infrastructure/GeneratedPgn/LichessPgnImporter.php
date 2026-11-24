<?php

declare(strict_types=1);

namespace App\Infrastructure\GeneratedPgn;

use App\Application\GeneratedPgn\LichessStudyImporter;
use App\Application\Studies\LichessStudyException;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\GuzzleException;

/**
 * POST https://lichess.org/api/study/{studyId}/import-pgn (form field `pgn`, scope study:write):
 * adds the PGN to an existing study, one chapter per game. The token only ever goes to
 * lichess.org, travels for this one call, and never appears in a message or a log.
 */
final class LichessPgnImporter implements LichessStudyImporter
{
    private const BASE = 'https://lichess.org';

    public function __construct(
        private readonly ClientInterface $http,
        private readonly string $userAgent = 'chess-ebook-reader generated PGN upload (personal library; contact: app owner)',
    ) {
    }

    public function importPgn(string $studyId, string $pgn, string $token): array
    {
        if (!preg_match('/^[A-Za-z0-9]{8}$/', $studyId)) {
            throw new \InvalidArgumentException('invalid study id');
        }
        try {
            $res = $this->http->request('POST', self::BASE . "/api/study/{$studyId}/import-pgn", [
                'headers' => ['Authorization' => 'Bearer ' . $token, 'Accept' => 'application/json', 'User-Agent' => $this->userAgent],
                'form_params' => ['pgn' => $pgn],
                'http_errors' => false,
                'timeout' => 60,
                'connect_timeout' => 10,
            ]);
        } catch (GuzzleException) {
            throw new LichessStudyException(0, 'could not reach Lichess');
        }
        $status = $res->getStatusCode();
        if ($status >= 400) {
            $retry = (int) ($res->getHeaderLine('Retry-After') ?: 60);
            throw match (true) {
                $status === 401, $status === 403 => new LichessStudyException($status, 'Lichess refused the token (it needs the study:write scope and access to that study)'),
                $status === 404 => new LichessStudyException(404, 'study not found, or not accessible with this token'),
                $status === 400 => new LichessStudyException(400, 'Lichess rejected the PGN'),
                $status === 429 => new LichessStudyException(429, "Lichess rate limit reached; retry in {$retry} s", $retry),
                default => new LichessStudyException($status, "Lichess answered {$status}"),
            };
        }
        $data = json_decode((string) $res->getBody(), true);
        $out = [];
        foreach (is_array($data['chapters'] ?? null) ? $data['chapters'] : [] as $c) {
            if (is_array($c) && isset($c['id']) && is_string($c['id'])) {
                $out[] = ['id' => $c['id'], 'name' => (string) ($c['name'] ?? $c['id'])];
            }
        }
        return $out;
    }
}

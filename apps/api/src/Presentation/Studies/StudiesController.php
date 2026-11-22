<?php

declare(strict_types=1);

namespace App\Presentation\Studies;

use App\Application\Studies\ImportStudiesHandler;
use App\Application\Studies\LichessStudyException;
use App\Application\Studies\LichessStudySource;
use App\Application\Studies\StudyCatalog;
use App\Application\Studies\SyncCommentStudiesHandler;
use App\Domain\Studies\StudyRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * The Studies library.
 *
 *   GET    /api/studies?sort&dir&author&q          → {studies, authors}
 *   GET    /api/studies/{id}                       → {study, pgn}
 *   POST   /api/studies/import {ref, follow?, depth?, max?, parts?} → {imported, skipped, linked, errors}
 *   GET    /api/studies/lichess/user/{handle}      → {user, studies}
 *   PUT    /api/studies/{id} {myRating?, lichessLikes?} → {study}
 *   DELETE /api/studies/{id}?group=1               → {deleted}
 *   POST   /api/studies/sync-comments              → {added, studies}
 */
final class StudiesController
{
    private const MAX_BODY = 65536;

    public function __construct(
        private readonly StudyCatalog $catalog,
        private readonly ImportStudiesHandler $import,
        private readonly SyncCommentStudiesHandler $sync,
        private readonly LichessStudySource $lichess,
        private readonly StudyRepository $studies,
    ) {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $text = static fn (string $k): ?string => isset($q[$k]) && is_string($q[$k]) ? $q[$k] : null;
        try {
            return $this->json($response, $this->catalog->list($text('sort') ?? 'name', $text('dir') ?? 'asc', $text('author'), $text('q')));
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 400);
        }
    }

    public function get(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $r = $this->catalog->get($id);
        return $r === null ? $this->json($response, ['error' => 'study not found'], 404) : $this->json($response, $r);
    }

    public function import(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = $this->body($request);
        if ($body === null) {
            return $this->json($response, ['error' => 'the body must be a JSON object'], 400);
        }
        $ref = $body['ref'] ?? null;
        $parts = $body['parts'] ?? [];
        if (!is_string($ref) || !is_array($parts) || !array_is_list($parts)) {
            return $this->json($response, ['error' => 'ref (a study URL or id) is required; parts must be a list'], 422);
        }
        $int = static fn (mixed $v, int $default): int => is_int($v) ? $v : $default;
        try {
            $result = $this->import->handle(
                $ref,
                ($body['follow'] ?? false) === true,
                $int($body['depth'] ?? null, 3),
                $int($body['max'] ?? null, 40),
                $parts,
                $this->userId($request),
            );
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 422);
        }
        return $this->json($response, $result);
    }

    public function lichessUser(ServerRequestInterface $request, ResponseInterface $response, string $handle): ResponseInterface
    {
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,28}$/', $handle)) {
            return $this->json($response, ['error' => 'invalid Lichess handle'], 422);
        }
        try {
            $list = $this->lichess->listUserStudies($handle);
        } catch (LichessStudyException $e) {
            return $this->lichessError($response, $e);
        }
        $have = array_flip($this->studies->ids());
        return $this->json($response, ['user' => $handle, 'studies' => array_map(fn (array $s): array => $s + ['imported' => isset($have[$s['id']])], $list)]);
    }

    public function update(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $body = $this->body($request);
        if ($body === null) {
            return $this->json($response, ['error' => 'the body must be a JSON object'], 400);
        }
        try {
            return $this->json($response, ['study' => $this->catalog->update($id, $body)]);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 422);
        } catch (\OutOfBoundsException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        }
    }

    public function delete(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $group = ($request->getQueryParams()['group'] ?? '') === '1';
        $isAdmin = ($request->getAttribute('auth_user')?->role ?? '') === 'admin';
        try {
            return $this->json($response, ['deleted' => $this->catalog->delete($id, $group, $this->userId($request), $isAdmin)]);
        } catch (\OutOfBoundsException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        } catch (\DomainException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 403);
        }
    }

    public function syncComments(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, $this->sync->handle());
    }

    private function lichessError(ResponseInterface $response, LichessStudyException $e): ResponseInterface
    {
        $status = match (true) {
            $e->status === 429 => 429,
            $e->status === 404 => 404,
            default => 502,
        };
        $out = $this->json($response, ['error' => $e->getMessage()] + ($e->retryAfter !== null ? ['retryAfter' => $e->retryAfter] : []), $status);
        return $e->retryAfter !== null ? $out->withHeader('Retry-After', (string) $e->retryAfter) : $out;
    }

    /** @return array<string, mixed>|null */
    private function body(ServerRequestInterface $request): ?array
    {
        $raw = (string) $request->getBody();
        if (strlen($raw) > self::MAX_BODY) {
            return null;
        }
        $body = json_decode($raw, true);
        return is_array($body) && !array_is_list($body) ? $body : null;
    }

    private function userId(ServerRequestInterface $request): ?int
    {
        $sub = $request->getAttribute('auth_user')->sub ?? null;
        return is_int($sub) || (is_string($sub) && ctype_digit($sub)) ? (int) $sub : null;
    }

    /** @param array<string, mixed> $body */
    private function json(ResponseInterface $response, array $body, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

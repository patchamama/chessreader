<?php

declare(strict_types=1);

namespace App\Presentation\GeneratedPgn;

use App\Application\GeneratedPgn\GeneratedPgnService;
use App\Application\Studies\LichessStudyException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * The generated-PGN area (PGN made from the recognised games of library books).
 *
 *   GET    /api/generated-pgn?book_id&status&q   → {items, books}   (items carry no PGN text)
 *   GET    /api/generated-pgn/{id}               → {item}
 *   POST   /api/generated-pgn {games:[{bookId, bookTitle, chapter, gameIndex, white, black, event, result, pgn}]} → {created, updated, skipped}
 *   PUT    /api/generated-pgn/{id} {status?, pgn?, white?, black?, event?, result?} → {item}   (author or admin)
 *   DELETE /api/generated-pgn/{id}                                                  (author or admin)
 *   POST   /api/generated-pgn/{id}/lichess {studyId, visibility, token}             (author or admin)
 *          adds the PGN to an existing study; the token is used for this call only.
 */
final class GeneratedPgnController
{
    private const MAX_BODY = 6_000_000;

    public function __construct(private readonly GeneratedPgnService $service)
    {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $text = static fn (string $k): ?string => isset($q[$k]) && is_string($q[$k]) && $q[$k] !== '' ? $q[$k] : null;
        $book = $text('book_id');
        if ($book !== null && !ctype_digit($book)) {
            return $this->json($response, ['error' => 'book_id must be a number'], 400);
        }
        try {
            return $this->json($response, $this->service->list($book === null ? null : (int) $book, $text('status'), $text('q'), $this->userId($request), $this->isAdmin($request)));
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 400);
        }
    }

    public function get(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        try {
            return $this->json($response, ['item' => $this->service->get((int) $id, $this->userId($request), $this->isAdmin($request))]);
        } catch (\OutOfBoundsException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        }
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = $this->body($request);
        if ($body === null) {
            return $this->json($response, ['error' => 'the body must be a JSON object (up to 6 MB)'], 400);
        }
        try {
            return $this->json($response, $this->service->create($body['games'] ?? null, $this->userId($request)));
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 422);
        }
    }

    public function update(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $body = $this->body($request);
        if ($body === null) {
            return $this->json($response, ['error' => 'the body must be a JSON object'], 400);
        }
        try {
            return $this->json($response, ['item' => $this->service->update((int) $id, $body, $this->userId($request), $this->isAdmin($request))]);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 422);
        } catch (\OutOfBoundsException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        } catch (\DomainException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 403);
        }
    }

    public function delete(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        try {
            $this->service->delete((int) $id, $this->userId($request), $this->isAdmin($request));
            return $this->json($response, ['deleted' => 1]);
        } catch (\OutOfBoundsException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        } catch (\DomainException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 403);
        }
    }

    public function lichess(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $body = $this->body($request);
        if ($body === null) {
            return $this->json($response, ['error' => 'the body must be a JSON object'], 400);
        }
        try {
            $r = $this->service->uploadToLichess((int) $id, $body['studyId'] ?? null, $body['visibility'] ?? null, $body['token'] ?? null, $this->userId($request), $this->isAdmin($request));
            return $this->json($response, $r);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 422);
        } catch (\OutOfBoundsException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        } catch (\DomainException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 403);
        } catch (LichessStudyException $e) {
            $status = $e->status === 429 ? 429 : ($e->status === 404 ? 404 : 502);
            $out = $this->json($response, ['error' => $e->getMessage()] + ($e->retryAfter !== null ? ['retryAfter' => $e->retryAfter] : []), $status);
            return $e->retryAfter !== null ? $out->withHeader('Retry-After', (string) $e->retryAfter) : $out;
        }
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

    private function isAdmin(ServerRequestInterface $request): bool
    {
        return ($request->getAttribute('auth_user')?->role ?? '') === 'admin';
    }

    /** @param array<string, mixed> $body */
    private function json(ResponseInterface $response, array $body, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

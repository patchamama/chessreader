<?php

declare(strict_types=1);

namespace App\Presentation\Errata;

use App\Application\Errata\BookSlug;
use App\Application\Errata\ErrataEntryValidator;
use App\Application\Errata\ErrataRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Errata: corrected main lines of book games (a wrong move printed in the
 * book, fixed from an online reference, the engine or by hand).
 *
 *   POST /api/errata                       stores one entry (validated)
 *   GET  /api/errata?book=<title|slug>&chapter=<n>   lists the entries
 */
final class ErrataController
{
    private const MAX_BODY = 262144;

    public function __construct(
        private readonly ErrataRepository $repository,
        private readonly ErrataEntryValidator $validator = new ErrataEntryValidator(),
    ) {
    }

    public function save(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $raw = (string) $request->getBody();
        if (strlen($raw) > self::MAX_BODY) {
            return $this->json($response, ['error' => 'entry too large'], 413);
        }
        $entry = json_decode($raw, true);
        if (!is_array($entry)) {
            return $this->json($response, ['error' => 'the body must be a JSON object'], 400);
        }
        $errors = $this->validator->validate($entry);
        if ($errors !== []) {
            return $this->json($response, ['error' => 'invalid errata entry', 'errors' => $errors], 422);
        }
        try {
            $path = $this->repository->save($entry);
        } catch (\OverflowException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 507);
        } catch (\Throwable) {
            return $this->json($response, ['error' => 'could not save the entry'], 500);
        }
        return $this->json($response, ['ok' => true, 'path' => $path], 201);
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = $request->getQueryParams();
        $book = is_string($query['book'] ?? null) ? BookSlug::of($query['book']) : '';
        if ($book === '') {
            return $this->json($response, ['error' => 'book is required'], 400);
        }
        $chapter = $query['chapter'] ?? null;
        if ($chapter !== null && (!is_string($chapter) || !ctype_digit($chapter))) {
            return $this->json($response, ['error' => 'chapter must be a number'], 400);
        }
        $entries = $this->repository->find($book, $chapter === null ? null : (int) $chapter);
        return $this->json($response, ['book' => $book, 'entries' => $entries]);
    }

    /** @param array<string, mixed> $body */
    private function json(ResponseInterface $response, array $body, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

<?php

declare(strict_types=1);

namespace App\Presentation\Suggestions;

use App\Application\Errata\BookSlug;
use App\Application\Suggestions\SuggestionAssetStore;
use App\Application\Suggestions\SuggestionRepository;
use App\Application\Suggestions\SuggestionValidator;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;

/**
 * Suggestions: proposed improvements of a book, reviewed later.
 *
 *   GET   /api/suggestions?kind&book&status&chapter&offset&limit   lists them (book: title or slug)
 *   POST  /api/suggestions                  stores one (validated; always pending)
 *   PATCH /api/suggestions/{id}  {status}   reviews one (admin); its author may only set rejected (withdraw)
 *   POST  /api/suggestions/assets           uploads an image (multipart field "file"; PNG, JPEG, WebP; at most 5 MB)
 *   GET   /api/suggestions/assets/{name}    serves an uploaded image
 */
final class SuggestionsController
{
    private const MAX_BODY = 262144;
    private const MAX_LIMIT = 500;

    public function __construct(
        private readonly SuggestionRepository $repository,
        private readonly SuggestionAssetStore $assets,
        private readonly SuggestionValidator $validator = new SuggestionValidator(),
    ) {
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $filter = [];
        if (isset($q['kind'])) {
            if (!$this->validator->isKind($q['kind'])) {
                return $this->json($response, ['error' => 'unknown kind'], 400);
            }
            $filter['kind'] = $q['kind'];
        }
        if (isset($q['status'])) {
            if (!$this->validator->isStatus($q['status'])) {
                return $this->json($response, ['error' => 'unknown status'], 400);
            }
            $filter['status'] = $q['status'];
        }
        if (isset($q['book'])) {
            $slug = is_string($q['book']) ? BookSlug::of($q['book']) : '';
            if ($slug === '') {
                return $this->json($response, ['error' => 'book must contain letters or digits'], 400);
            }
            $filter['book'] = $slug;
        }
        $numbers = [];
        foreach (['chapter' => null, 'offset' => 0, 'limit' => 100] as $key => $default) {
            $v = $q[$key] ?? null;
            if ($v === null) {
                $numbers[$key] = $default;
            } elseif (is_string($v) && ctype_digit($v) && strlen($v) <= 9) {
                $numbers[$key] = (int) $v;
            } else {
                return $this->json($response, ['error' => "{$key} must be a number"], 400);
            }
        }
        if ($numbers['chapter'] !== null) {
            $filter['chapter'] = $numbers['chapter'];
        }
        $limit = min(self::MAX_LIMIT, max(1, $numbers['limit']));
        $page = $this->repository->find($filter, $numbers['offset'], $limit);
        return $this->json($response, [...$page, 'offset' => $numbers['offset'], 'limit' => $limit]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $raw = (string) $request->getBody();
        if (strlen($raw) > self::MAX_BODY) {
            return $this->json($response, ['error' => 'suggestion too large'], 413);
        }
        $suggestion = json_decode($raw, true);
        if (!is_array($suggestion) || array_is_list($suggestion)) {
            return $this->json($response, ['error' => 'the body must be a JSON object'], 400);
        }
        $errors = $this->validator->validate($suggestion);
        if ($errors !== []) {
            return $this->json($response, ['error' => 'invalid suggestion', 'errors' => $errors], 422);
        }
        try {
            $this->repository->create($suggestion, $this->userId($request));
        } catch (\DomainException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 409);
        } catch (\OverflowException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 507);
        } catch (\Throwable) {
            return $this->json($response, ['error' => 'could not save the suggestion'], 500);
        }
        return $this->json($response, ['ok' => true, 'suggestion' => $this->repository->get($suggestion['id'])], 201);
    }

    public function updateStatus(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $raw = (string) $request->getBody();
        $body = strlen($raw) <= 1024 ? json_decode($raw, true) : null;
        $status = is_array($body) ? ($body['status'] ?? null) : null;
        if (!$this->validator->isStatus($status)) {
            return $this->json($response, ['error' => 'status must be one of ' . implode(', ', SuggestionValidator::STATUSES)], 422);
        }
        $suggestion = $this->repository->get($id);
        if ($suggestion === null) {
            return $this->json($response, ['error' => 'suggestion not found'], 404);
        }
        $user = $request->getAttribute('auth_user');
        $isAdmin = ($user->role ?? '') === 'admin';
        $isOwner = $suggestion['createdBy'] !== null && $suggestion['createdBy'] === $this->userId($request);
        // Review is the admin's: the author may only withdraw (reject) their own suggestion.
        if (!$isAdmin && !($isOwner && $status === 'rejected')) {
            return $this->json($response, ['error' => $isOwner
                ? 'only an admin can accept or apply a suggestion; its author can only withdraw it'
                : 'only the author or an admin can change this suggestion'], 403);
        }
        $this->repository->setStatus($id, $status);
        return $this->json($response, ['ok' => true, 'suggestion' => $this->repository->get($id)]);
    }

    public function uploadAsset(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $file = $request->getUploadedFiles()['file'] ?? null;
        if (!$file instanceof UploadedFileInterface || $file->getError() !== UPLOAD_ERR_OK) {
            $tooBig = $file instanceof UploadedFileInterface && in_array($file->getError(), [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
            return $tooBig
                ? $this->json($response, ['error' => 'the image is larger than 5 MB'], 413)
                : $this->json($response, ['error' => 'send the image as the multipart field "file"'], 400);
        }
        if (($file->getSize() ?? 0) > SuggestionAssetStore::MAX_BYTES) {
            return $this->json($response, ['error' => 'the image is larger than 5 MB'], 413);
        }
        try {
            $name = $this->assets->store((string) $file->getStream());
        } catch (\LengthException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 413);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 415);
        } catch (\Throwable) {
            return $this->json($response, ['error' => 'could not store the image'], 500);
        }
        return $this->json($response, ['ok' => true, 'path' => "suggestions/assets/{$name}", 'url' => "/api/suggestions/assets/{$name}"], 201);
    }

    public function getAsset(ServerRequestInterface $request, ResponseInterface $response, string $name): ResponseInterface
    {
        $asset = $this->assets->read($name);
        if ($asset === null) {
            return $this->json($response, ['error' => 'image not found'], 404);
        }
        $response->getBody()->write($asset['bytes']);
        return $response
            ->withHeader('Content-Type', $asset['type'])
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Content-Security-Policy', "default-src 'none'")
            ->withHeader('Cache-Control', 'private, max-age=31536000, immutable');
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

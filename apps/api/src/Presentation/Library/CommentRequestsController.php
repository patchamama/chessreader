<?php

declare(strict_types=1);

namespace App\Presentation\Library;

use App\Application\Library\CommentRequests;
use App\Domain\Auth\Role;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class CommentRequestsController
{
    public function __construct(private readonly CommentRequests $requests) {}

    public function create(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        $body = (array) json_decode((string) $request->getBody(), true);
        $note = $body['note'] ?? '';
        if (!is_string($note)) {
            return $this->json($response, ['error' => 'note must be a string'], 422);
        }
        try {
            $result = $this->requests->request($id, $note, (int) $request->getAttribute('auth_user')->sub);
        } catch (\DomainException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 422);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        }
        return $this->json($response, ['request' => $result['request']->toArray()], $result['created'] ? 201 : 200);
    }

    public function cancel(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        $auth = $request->getAttribute('auth_user');
        try {
            $this->requests->cancel($id, (int) $auth->sub, $this->isAdmin($auth));
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        } catch (\RuntimeException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 403);
        }
        return $this->json($response, ['ok' => true]);
    }

    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $status = (string) ($request->getQueryParams()['status'] ?? 'pending');
        try {
            $items = $this->requests->list($status);
        } catch (\DomainException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 422);
        }
        return $this->json($response, ['requests' => array_map(fn ($r) => $r->toArray(), $items)]);
    }

    public function setStatus(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        $body   = (array) json_decode((string) $request->getBody(), true);
        $status = $body['status'] ?? null;
        try {
            $updated = $this->requests->setStatus($id, is_string($status) ? $status : '');
        } catch (\DomainException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 422);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        }
        return $this->json($response, ['request' => $updated->toArray()]);
    }

    private function isAdmin(object $authUser): bool
    {
        return isset($authUser->role) && $authUser->role === Role::Admin->value;
    }

    /** @param array<string,mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write(json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

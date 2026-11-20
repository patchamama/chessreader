<?php

declare(strict_types=1);

namespace App\Presentation\Comments;

use App\Application\Comments\Port\CommentsReadOnly;
use App\Application\Comments\Port\PositionCommentStore;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** What authors said about a position, and the game a comment comes from. */
final class CommentsController
{
    public function __construct(private readonly PositionCommentStore $store)
    {
    }

    public function position(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $hash = (string) ($q['hash'] ?? '');
        $fen = trim((string) ($q['fen'] ?? ''));
        if (!preg_match('/^[0-9a-f]{16}$/', $hash) || $fen === '') {
            return $this->json($response, ['error' => 'hash and fen are required'], 400);
        }
        $key = implode(' ', array_slice(preg_split('/\s+/', $fen) ?: [], 0, 4));
        return $this->json($response, ['comments' => $this->store->forPosition($hash, $key, (int) ($q['limit'] ?? 5))]);
    }

    /** GET /api/comments?offset&limit(≤200)&q&source&lang&kind: a page of every comment and the total. */
    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $kind = (string) ($q['kind'] ?? '');
        $lang = (string) ($q['lang'] ?? '');
        if (!in_array($kind, ['', 'book', 'lichess'], true) || !preg_match('/^[a-z]{0,3}$/', $lang)) {
            return $this->json($response, ['error' => 'kind is book or lichess; lang is a language code'], 400);
        }
        $filters = ['q' => mb_substr(trim((string) ($q['q'] ?? '')), 0, 200), 'lang' => $lang, 'kind' => $kind, 'hidden' => ($q['hidden'] ?? '0') === '1'];
        if (isset($q['source']) && preg_match('/^\d{1,9}$/', (string) $q['source'])) {
            $filters['source'] = (int) $q['source'];
        }
        $offset = max(0, (int) ($q['offset'] ?? 0));
        $limit = max(1, min(200, (int) ($q['limit'] ?? 50)));
        $page = $this->store->list($filters, $offset, $limit);
        return $this->json($response, ['total' => $page['total'], 'offset' => $offset, 'limit' => $limit, 'comments' => $page['comments']]);
    }

    /** GET /api/comments/sources: the books and studies the comments come from. */
    public function sources(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, ['sources' => $this->store->sources()]);
    }

    public function game(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $game = $this->store->game($id);
        return $game === null ? $this->json($response, ['error' => 'not found'], 404) : $this->json($response, $game);
    }

    /** DELETE /api/comments/{id}: hides a comment (it stays in the database); 404 unknown, 409 read-only database. */
    public function delete(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        return $this->toggle($response, $id, true);
    }

    /** POST /api/comments/{id}/restore: shows a hidden comment again. */
    public function restore(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        return $this->toggle($response, $id, false);
    }

    private function toggle(ResponseInterface $response, int $id, bool $hide): ResponseInterface
    {
        try {
            $found = $hide ? $this->store->hide($id) : $this->store->restore($id);
        } catch (CommentsReadOnly) {
            return $this->json($response, ['error' => 'The comments database is read-only on this server; change the comment where it is built'], 409);
        }
        return $found ? $this->json($response, [$hide ? 'hidden' : 'restored' => $id]) : $this->json($response, ['error' => 'not found'], 404);
    }

    /** @param array<string, mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

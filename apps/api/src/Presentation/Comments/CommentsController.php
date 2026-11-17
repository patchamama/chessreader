<?php

declare(strict_types=1);

namespace App\Presentation\Comments;

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

    public function game(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $game = $this->store->game($id);
        return $game === null ? $this->json($response, ['error' => 'not found'], 404) : $this->json($response, $game);
    }

    /** @param array<string, mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

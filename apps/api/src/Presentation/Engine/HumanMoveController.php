<?php

declare(strict_types=1);

namespace App\Presentation\Engine;

use App\Application\Engine\Port\HumanMoveModel;
use App\Domain\Chess\Fen;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** What a player of a given rating would play (Maia), for the tutor. */
final class HumanMoveController
{
    public function __construct(private readonly HumanMoveModel $model)
    {
    }

    public function predict(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $fen = trim((string) ($q['fen'] ?? ''));
        if ($fen === '' || !Fen::isWellFormed($fen)) {
            return $this->json($response, ['error' => 'fen must be a valid FEN'], 400);
        }
        if ($this->model->ratings() === []) {
            return $this->json($response, ['error' => 'Maia is not installed on this server.', 'ratings' => []], 503);
        }
        try {
            $result = $this->model->predict(Fen::fromString($fen), (int) ($q['rating'] ?? 1500), max(1, min(10, (int) ($q['limit'] ?? 3))));
        } catch (\Throwable $e) {
            return $this->json($response, ['error' => $e->getMessage()], 502);
        }
        return $this->json($response, $result + ['ratings' => $this->model->ratings()]);
    }

    /** @param array<string, mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

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
    public function __construct(private readonly HumanMoveModel $model, private readonly ?\App\Application\Engine\Port\PlayingEngines $engines = null)
    {
    }

    /** The engines that can play on this server. */
    public function engines(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, ['engines' => $this->engines?->list() ?? []]);
    }

    /** An engine's move: ?engine=maia-1500&fen=…&level=3 */
    public function play(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $fen = trim((string) ($q['fen'] ?? ''));
        if (!Fen::isWellFormed($fen) || !preg_match('/^[a-z0-9-]{2,30}$/', (string) ($q['engine'] ?? ''))) {
            return $this->json($response, ['error' => 'engine and a valid fen are required'], 400);
        }
        $move = $this->engines?->move((string) $q['engine'], Fen::fromString($fen), (int) ($q['level'] ?? 3));
        return $move === null ? $this->json($response, ['error' => 'that engine is not available'], 404) : $this->json($response, ['move' => $move]);
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

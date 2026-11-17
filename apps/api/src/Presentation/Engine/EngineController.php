<?php

declare(strict_types=1);

namespace App\Presentation\Engine;

use App\Application\Engine\StockfishVersions;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** Admin: which Stockfish the server runs, download a release, choose one. */
final class EngineController
{
    public function __construct(private readonly StockfishVersions $versions)
    {
    }

    public function status(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, $this->versions->status());
    }

    public function install(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $tag = (string) (((array) ($request->getParsedBody() ?? []))['tag'] ?? '');
        try {
            $this->versions->install($tag);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 400);
        } catch (\RuntimeException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 502);
        }
        return $this->json($response, $this->versions->status());
    }

    public function select(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $tag = (string) (((array) ($request->getParsedBody() ?? []))['tag'] ?? '');
        try {
            $this->versions->select($tag);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 400);
        }
        return $this->json($response, $this->versions->status());
    }

    /** @param array<string, mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

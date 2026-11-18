<?php

declare(strict_types=1);

namespace App\Presentation\Resources;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Private resources built from the books (traps, game database extracts…):
 * JSON files under storage/resources/, downloaded from the private repository
 * chessreader-resources by start.sh / start.bat. Only plain names are served.
 */
final class ResourcesController
{
    public function __construct(private readonly string $dir)
    {
    }

    public function get(ServerRequestInterface $request, ResponseInterface $response, string $name): ResponseInterface
    {
        if (!preg_match('/^[a-z][a-z0-9-]{0,40}$/', $name)) {
            return $this->json($response, '{"error":"bad name"}', 400);
        }
        $file = rtrim($this->dir, '/') . "/{$name}.json";
        if (!is_file($file)) {
            return $this->json($response, '{"error":"not found"}', 404);
        }
        return $this->json($response, (string) file_get_contents($file));
    }

    private function json(ResponseInterface $response, string $body, int $status = 200): ResponseInterface
    {
        $response->getBody()->write($body);
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

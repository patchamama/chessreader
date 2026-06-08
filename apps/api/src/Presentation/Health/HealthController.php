<?php

declare(strict_types=1);

namespace App\Presentation\Health;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

class HealthController
{
    public function __construct(private readonly array $settings)
    {
    }

    public function __invoke(Request $request, Response $response): Response
    {
        $payload = json_encode([
            'status'  => 'ok',
            'version' => $this->settings['version'],
        ]);

        $response->getBody()->write($payload);

        return $response->withHeader('Content-Type', 'application/json');
    }
}

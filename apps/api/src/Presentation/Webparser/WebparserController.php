<?php

declare(strict_types=1);

namespace App\Presentation\Webparser;

use App\Application\Webparser\ParseWebpageCommand;
use App\Application\Webparser\ParseWebpageHandler;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class WebparserController
{
    public function __construct(
        private readonly ParseWebpageHandler $handler,
    ) {
    }

    public function parse(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = $request->getParsedBody();
        $url  = is_array($body) ? trim((string) ($body['url'] ?? '')) : '';

        if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
            $response->getBody()->write(json_encode(['error' => 'A valid url is required'], JSON_THROW_ON_ERROR));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }

        try {
            $result = $this->handler->handle(new ParseWebpageCommand($url));
            $response->getBody()->write(json_encode($result->toArray(), JSON_THROW_ON_ERROR));
            return $response->withStatus(200)->withHeader('Content-Type', 'application/json');
        } catch (\RuntimeException $e) {
            $response->getBody()->write(json_encode(['error' => 'Failed to fetch URL', 'detail' => $e->getMessage()], JSON_THROW_ON_ERROR));
            return $response->withStatus(422)->withHeader('Content-Type', 'application/json');
        }
    }
}

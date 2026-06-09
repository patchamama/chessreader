<?php

declare(strict_types=1);

namespace App\Presentation\Recognition;

use App\Application\Recognition\RecognizeMovesCommand;
use App\Application\Recognition\RecognizeMovesHandler;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class RecognitionController
{
    public function __construct(
        private readonly RecognizeMovesHandler $handler,
    ) {
    }

    public function parse(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = $request->getParsedBody();
        $text = (string) ($body['text'] ?? '');

        if (empty(trim($text))) {
            $response->getBody()->write(json_encode(['error' => 'text is required'], JSON_THROW_ON_ERROR));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }

        $command = new RecognizeMovesCommand($text);
        $games = $this->handler->handle($command);

        $output = array_map(fn($game) => $game->toArray(), $games);

        $response->getBody()->write(json_encode(['games' => $output], JSON_THROW_ON_ERROR));
        return $response->withHeader('Content-Type', 'application/json');
    }
}

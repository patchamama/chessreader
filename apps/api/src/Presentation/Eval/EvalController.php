<?php

declare(strict_types=1);

namespace App\Presentation\Eval;

use App\Application\Eval\Command\EvaluateGameCommand;
use App\Application\Eval\Command\EvaluatePositionCommand;
use App\Application\Eval\EvaluateGameHandler;
use App\Application\Eval\EvaluatePositionHandler;
use App\Domain\Chess\Fen;
use App\Application\Eval\Port\ChessEngine;
use App\Application\Eval\Port\MultiLineEngine;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class EvalController
{
    private const MAX_DEPTH = 30;

    public function __construct(
        private readonly EvaluatePositionHandler $positionHandler,
        private readonly EvaluateGameHandler $gameHandler,
        private readonly ?ChessEngine $engine = null,
    ) {
    }

    public function position(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body  = (array) ($request->getParsedBody() ?? []);
        $fenStr = $body['fen'] ?? null;

        if ($fenStr === null || trim((string) $fenStr) === '') {
            $response->getBody()->write(json_encode(['error' => 'fen is required']));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }

        if (!Fen::isWellFormed((string) $fenStr)) {
            $response->getBody()->write(json_encode(['error' => 'fen is not a valid FEN']));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }

        // Deep searches tie up the engine: the depth is capped.
        $depth = isset($body['depth']) ? min(self::MAX_DEPTH, max(0, (int) $body['depth'])) : 0;

        $eval = $this->positionHandler->handle(
            new EvaluatePositionCommand(Fen::fromString((string) $fenStr), $depth)
        );

        $data = $eval->toArray();
        // Several lines (MultiPV) when asked and the engine can give them.
        $count = isset($body['lines']) ? (int) $body['lines'] : 1;
        if ($count > 1 && $this->engine instanceof MultiLineEngine) {
            $data['lines'] = array_map(fn($e) => $e->toArray(), $this->engine->evaluateLines(Fen::fromString((string) $fenStr), $depth > 0 ? $depth : 16, min($count, 5)));
        }

        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function game(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body  = (array) ($request->getParsedBody() ?? []);
        $fenStrs = $body['fens'] ?? null;

        if (!is_array($fenStrs)) {
            $response->getBody()->write(json_encode(['error' => 'fens array is required']));
            return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
        }

        foreach ($fenStrs as $f) {
            if (!is_string($f) || !Fen::isWellFormed($f)) {
                $response->getBody()->write(json_encode(['error' => 'fens must be valid FENs']));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
            }
        }
        $depth = isset($body['depth']) ? min(self::MAX_DEPTH, max(0, (int) $body['depth'])) : 0;
        $fens  = array_map(fn(string $f) => Fen::fromString($f), $fenStrs);

        $evals = $this->gameHandler->handle(new EvaluateGameCommand($fens, $depth));

        $response->getBody()->write(json_encode(array_map(fn($e) => $e->toArray(), $evals)));
        return $response->withHeader('Content-Type', 'application/json');
    }
}

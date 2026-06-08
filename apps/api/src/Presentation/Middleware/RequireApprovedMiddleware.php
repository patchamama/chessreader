<?php

declare(strict_types=1);

namespace App\Presentation\Middleware;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

final class RequireApprovedMiddleware implements MiddlewareInterface
{
    public function __construct(private readonly ResponseFactoryInterface $responseFactory)
    {
    }

    public function process(Request $request, Handler $handler): Response
    {
        $user = $request->getAttribute('auth_user');

        if ($user === null || ($user->status ?? '') !== 'approved') {
            $response = $this->responseFactory->createResponse(403);
            $response->getBody()->write(json_encode(['error' => 'Forbidden: account not approved']));
            return $response->withHeader('Content-Type', 'application/json');
        }

        return $handler->handle($request);
    }
}

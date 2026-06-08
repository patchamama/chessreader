<?php

declare(strict_types=1);

namespace App\Presentation\Auth;

use App\Application\Auth\Command\LoginCommand;
use App\Application\Auth\Command\RegisterUserCommand;
use App\Application\Auth\LoginHandler;
use App\Application\Auth\RegisterUserHandler;
use App\Domain\Auth\Exception\DuplicateEmailException;
use App\Domain\Auth\Exception\InvalidCredentialsException;
use App\Domain\Auth\Exception\UserNotApprovedException;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AuthController
{
    public function __construct(
        private readonly RegisterUserHandler $registerHandler,
        private readonly LoginHandler $loginHandler,
    ) {
    }

    public function register(Request $request, Response $response): Response
    {
        $body  = (array) json_decode((string) $request->getBody(), true);
        $email = trim($body['email'] ?? '');
        $pass  = $body['password'] ?? '';

        try {
            $user = $this->registerHandler->handle(new RegisterUserCommand($email, $pass));
        } catch (DuplicateEmailException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 409);
        }

        return $this->json($response, [
            'id'     => $user->id()->value(),
            'email'  => $user->email(),
            'status' => $user->status()->value,
        ], 201);
    }

    public function login(Request $request, Response $response): Response
    {
        $body  = (array) json_decode((string) $request->getBody(), true);
        $email = trim($body['email'] ?? '');
        $pass  = $body['password'] ?? '';

        try {
            $token = $this->loginHandler->handle(new LoginCommand($email, $pass));
        } catch (UserNotApprovedException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 403);
        } catch (InvalidCredentialsException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 401);
        }

        return $this->json($response, ['token' => $token], 200);
    }

    private function json(Response $response, array $data, int $status): Response
    {
        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}

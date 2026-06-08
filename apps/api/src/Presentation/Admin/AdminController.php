<?php

declare(strict_types=1);

namespace App\Presentation\Admin;

use App\Application\Auth\ApproveUserHandler;
use App\Application\Auth\Command\ApproveUserCommand;
use App\Application\Auth\Command\RejectUserCommand;
use App\Application\Auth\ListPendingUsersHandler;
use App\Application\Auth\RejectUserHandler;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AdminController
{
    public function __construct(
        private readonly ListPendingUsersHandler $listHandler,
        private readonly ApproveUserHandler $approveHandler,
        private readonly RejectUserHandler $rejectHandler,
    ) {
    }

    public function pendingUsers(Request $request, Response $response): Response
    {
        $users = $this->listHandler->handle();
        $data  = array_map(fn($u) => [
            'id'     => $u->id()->value(),
            'email'  => $u->email(),
            'status' => $u->status()->value,
        ], $users);

        $response->getBody()->write(json_encode($data));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function approve(Request $request, Response $response, int $id): Response
    {
        $this->approveHandler->handle(new ApproveUserCommand($id));
        $response->getBody()->write(json_encode(['ok' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function reject(Request $request, Response $response, int $id): Response
    {
        $this->rejectHandler->handle(new RejectUserCommand($id));
        $response->getBody()->write(json_encode(['ok' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    }
}

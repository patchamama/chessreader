<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Auth\Command\RejectUserCommand;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;

final class RejectUserHandler
{
    public function __construct(private readonly UserRepository $repository)
    {
    }

    public function handle(RejectUserCommand $command): void
    {
        $user = $this->repository->findById(new UserId($command->userId));
        if ($user === null) {
            throw new \RuntimeException("User {$command->userId} not found.");
        }
        $this->repository->save($user->withStatus(RegistrationStatus::Rejected));
    }
}

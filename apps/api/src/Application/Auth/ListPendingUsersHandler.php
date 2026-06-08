<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Domain\Auth\User;
use App\Domain\Auth\UserRepository;

final class ListPendingUsersHandler
{
    public function __construct(private readonly UserRepository $repository)
    {
    }

    /** @return User[] */
    public function handle(): array
    {
        return $this->repository->findAllPending();
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Auth;

use App\Application\Auth\Command\RegisterUserCommand;
use App\Application\Auth\Port\PasswordHasher;
use App\Domain\Auth\Exception\DuplicateEmailException;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use DateTimeImmutable;

final class RegisterUserHandler
{
    public function __construct(
        private readonly UserRepository $repository,
        private readonly PasswordHasher $hasher,
    ) {
    }

    public function handle(RegisterUserCommand $command): User
    {
        if ($this->repository->findByEmail($command->email) !== null) {
            throw new DuplicateEmailException($command->email);
        }

        $user = new User(
            new UserId(0), // id assigned by repository on save
            $command->email,
            $this->hasher->hash($command->password),
            Role::User,
            RegistrationStatus::Pending,
            new DateTimeImmutable(),
        );

        return $this->repository->save($user);
    }
}

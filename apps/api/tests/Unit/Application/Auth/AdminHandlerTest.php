<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Auth;

use App\Application\Auth\ApproveUserHandler;
use App\Application\Auth\Command\ApproveUserCommand;
use App\Application\Auth\Command\RejectUserCommand;
use App\Application\Auth\RejectUserHandler;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

class AdminHandlerTest extends TestCase
{
    private function pendingUser(int $id): User
    {
        return new User(new UserId($id), "user{$id}@test.com", 'hash', Role::User, RegistrationStatus::Pending, new DateTimeImmutable());
    }

    public function testApproveUserHandlerTransitionsStatusToApproved(): void
    {
        $user = $this->pendingUser(42);
        $repo = $this->createMock(UserRepository::class);
        $repo->method('findById')->willReturn($user);
        $repo->expects($this->once())->method('save')->with($this->callback(
            fn(User $u) => $u->status() === RegistrationStatus::Approved
        ))->willReturnCallback(fn(User $u) => $u);

        (new ApproveUserHandler($repo))->handle(new ApproveUserCommand(42));
    }

    public function testRejectUserHandlerTransitionsStatusToRejected(): void
    {
        $user = $this->pendingUser(42);
        $repo = $this->createMock(UserRepository::class);
        $repo->method('findById')->willReturn($user);
        $repo->expects($this->once())->method('save')->with($this->callback(
            fn(User $u) => $u->status() === RegistrationStatus::Rejected
        ))->willReturnCallback(fn(User $u) => $u);

        (new RejectUserHandler($repo))->handle(new RejectUserCommand(42));
    }
}

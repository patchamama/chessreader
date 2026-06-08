<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Auth;

use App\Application\Auth\Command\RegisterUserCommand;
use App\Application\Auth\Port\PasswordHasher;
use App\Application\Auth\RegisterUserHandler;
use App\Domain\Auth\Exception\DuplicateEmailException;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

class RegisterUserHandlerTest extends TestCase
{
    public function testCreatesUserWithPendingStatus(): void
    {
        $repo = $this->createMock(UserRepository::class);
        $hasher = $this->createMock(PasswordHasher::class);

        $repo->method('findByEmail')->willReturn(null);
        $hasher->method('hash')->willReturn('hashed_secret');
        $repo->method('save')->willReturnCallback(function (User $u) {
            return new User(new UserId(1), $u->email(), $u->passwordHash(), $u->role(), $u->status(), $u->createdAt());
        });

        $handler = new RegisterUserHandler($repo, $hasher);
        $result = $handler->handle(new RegisterUserCommand('alice@test.com', 'secret'));

        $this->assertSame('alice@test.com', $result->email());
        $this->assertSame(RegistrationStatus::Pending, $result->status());
        $this->assertSame(Role::User, $result->role());
        $this->assertSame('hashed_secret', $result->passwordHash());
    }

    public function testThrowsDuplicateEmailException(): void
    {
        $repo = $this->createMock(UserRepository::class);
        $hasher = $this->createMock(PasswordHasher::class);

        $existing = new User(new UserId(1), 'alice@test.com', 'h', Role::User, RegistrationStatus::Pending, new DateTimeImmutable());
        $repo->method('findByEmail')->willReturn($existing);
        $repo->expects($this->never())->method('save');

        $this->expectException(DuplicateEmailException::class);

        $handler = new RegisterUserHandler($repo, $hasher);
        $handler->handle(new RegisterUserCommand('alice@test.com', 'secret'));
    }
}

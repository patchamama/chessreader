<?php

declare(strict_types=1);

namespace App\Tests\Unit\Domain\Auth;

use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

class UserTest extends TestCase
{
    public function testConstructorAndGetters(): void
    {
        $id = new UserId(1);
        $createdAt = new DateTimeImmutable('2024-01-01');
        $user = new User(
            $id,
            'alice@test.com',
            'hashed_password',
            Role::User,
            RegistrationStatus::Pending,
            $createdAt,
        );

        $this->assertSame(1, $user->id()->value());
        $this->assertSame('alice@test.com', $user->email());
        $this->assertSame('hashed_password', $user->passwordHash());
        $this->assertSame(Role::User, $user->role());
        $this->assertSame(RegistrationStatus::Pending, $user->status());
        $this->assertSame($createdAt, $user->createdAt());
    }

    public function testWithStatusReturnsNewInstance(): void
    {
        $user = new User(
            new UserId(1),
            'bob@test.com',
            'hash',
            Role::User,
            RegistrationStatus::Pending,
            new DateTimeImmutable(),
        );

        $approved = $user->withStatus(RegistrationStatus::Approved);

        $this->assertNotSame($user, $approved);
        $this->assertSame(RegistrationStatus::Approved, $approved->status());
        $this->assertSame(RegistrationStatus::Pending, $user->status());
    }
}

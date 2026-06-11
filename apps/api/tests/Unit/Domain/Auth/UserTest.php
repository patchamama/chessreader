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

    public function testDefaultLoginCountAndLastReadBookId(): void
    {
        $user = new User(
            new UserId(1),
            'alice@test.com',
            'hash',
            Role::User,
            RegistrationStatus::Pending,
            new DateTimeImmutable(),
        );

        $this->assertSame(0, $user->loginCount());
        $this->assertNull($user->lastReadBookId());
    }

    public function testWithLoginCountReturnsNewImmutableInstance(): void
    {
        $user = new User(
            new UserId(1),
            'alice@test.com',
            'hash',
            Role::User,
            RegistrationStatus::Pending,
            new DateTimeImmutable(),
        );

        $updated = $user->withLoginCount(5);

        $this->assertNotSame($user, $updated);
        $this->assertSame(5, $updated->loginCount());
        $this->assertSame(0, $user->loginCount());
    }

    public function testWithLastReadBookIdReturnsNewImmutableInstance(): void
    {
        $user = new User(
            new UserId(1),
            'alice@test.com',
            'hash',
            Role::User,
            RegistrationStatus::Pending,
            new DateTimeImmutable(),
        );

        $updated = $user->withLastReadBookId(42);

        $this->assertNotSame($user, $updated);
        $this->assertSame(42, $updated->lastReadBookId());
        $this->assertNull($user->lastReadBookId());
    }

    public function testWithLastReadBookIdAcceptsNull(): void
    {
        $user = new User(
            new UserId(1),
            'alice@test.com',
            'hash',
            Role::User,
            RegistrationStatus::Pending,
            new DateTimeImmutable(),
            loginCount: 3,
            lastReadBookId: 10,
        );

        $updated = $user->withLastReadBookId(null);
        $this->assertNull($updated->lastReadBookId());
    }

    public function testWithPasswordHashReturnsNewImmutableInstance(): void
    {
        $user = new User(
            new UserId(1),
            'alice@test.com',
            'old_hash',
            Role::User,
            RegistrationStatus::Approved,
            new DateTimeImmutable(),
        );

        $updated = $user->withPasswordHash('new_hash');

        $this->assertNotSame($user, $updated);
        $this->assertSame('new_hash', $updated->passwordHash());
        $this->assertSame('old_hash', $user->passwordHash());
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

<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Auth;

use App\Application\Auth\Command\LoginCommand;
use App\Application\Auth\LoginHandler;
use App\Application\Auth\Port\PasswordHasher;
use App\Application\Auth\Port\TokenIssuer;
use App\Domain\Auth\Exception\InvalidCredentialsException;
use App\Domain\Auth\Exception\UserNotApprovedException;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

class LoginHandlerTest extends TestCase
{
    private function makeUser(RegistrationStatus $status): User
    {
        return new User(
            new UserId(1),
            'alice@test.com',
            'correct_hash',
            Role::User,
            $status,
            new DateTimeImmutable(),
        );
    }

    public function testPendingUserThrowsUserNotApproved(): void
    {
        $repo = $this->createMock(UserRepository::class);
        $repo->method('findByEmail')->willReturn($this->makeUser(RegistrationStatus::Pending));
        $hasher = $this->createMock(PasswordHasher::class);
        $issuer = $this->createMock(TokenIssuer::class);

        $this->expectException(UserNotApprovedException::class);
        (new LoginHandler($repo, $hasher, $issuer))->handle(new LoginCommand('alice@test.com', 'pw'));
    }

    public function testRejectedUserThrowsUserNotApproved(): void
    {
        $repo = $this->createMock(UserRepository::class);
        $repo->method('findByEmail')->willReturn($this->makeUser(RegistrationStatus::Rejected));
        $hasher = $this->createMock(PasswordHasher::class);
        $issuer = $this->createMock(TokenIssuer::class);

        $this->expectException(UserNotApprovedException::class);
        (new LoginHandler($repo, $hasher, $issuer))->handle(new LoginCommand('alice@test.com', 'pw'));
    }

    public function testWrongPasswordThrowsInvalidCredentials(): void
    {
        $repo = $this->createMock(UserRepository::class);
        $repo->method('findByEmail')->willReturn($this->makeUser(RegistrationStatus::Approved));
        $hasher = $this->createMock(PasswordHasher::class);
        $hasher->method('verify')->willReturn(false);
        $issuer = $this->createMock(TokenIssuer::class);

        $this->expectException(InvalidCredentialsException::class);
        (new LoginHandler($repo, $hasher, $issuer))->handle(new LoginCommand('alice@test.com', 'wrong'));
    }

    public function testApprovedUserWithCorrectPasswordReturnsToken(): void
    {
        $repo = $this->createMock(UserRepository::class);
        $repo->method('findByEmail')->willReturn($this->makeUser(RegistrationStatus::Approved));
        $hasher = $this->createMock(PasswordHasher::class);
        $hasher->method('verify')->willReturn(true);
        $issuer = $this->createMock(TokenIssuer::class);
        $issuer->method('issue')->willReturn('jwt.token.here');

        $token = (new LoginHandler($repo, $hasher, $issuer))->handle(new LoginCommand('alice@test.com', 'correct'));
        $this->assertSame('jwt.token.here', $token);
    }

    public function testUnknownEmailThrowsInvalidCredentials(): void
    {
        $repo = $this->createMock(UserRepository::class);
        $repo->method('findByEmail')->willReturn(null);
        $hasher = $this->createMock(PasswordHasher::class);
        $issuer = $this->createMock(TokenIssuer::class);

        $this->expectException(InvalidCredentialsException::class);
        (new LoginHandler($repo, $hasher, $issuer))->handle(new LoginCommand('ghost@test.com', 'pw'));
    }
}

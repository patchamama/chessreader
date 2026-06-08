<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure;

use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Infrastructure\Auth\JwtTokenIssuer;
use DateTimeImmutable;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use PHPUnit\Framework\TestCase;

class JwtTokenIssuerTest extends TestCase
{
    public function testIssueReturnsValidJwt(): void
    {
        $secret = 'test-secret-that-is-at-least-32-chars-long!!';
        $user = new User(new UserId(7), 'alice@test.com', 'h', Role::Admin, RegistrationStatus::Approved, new DateTimeImmutable());

        $issuer = new JwtTokenIssuer($secret);
        $token = $issuer->issue($user);

        $this->assertNotEmpty($token);

        $decoded = JWT::decode($token, new Key($secret, 'HS256'));
        $this->assertSame(7, $decoded->sub);
        $this->assertSame('alice@test.com', $decoded->email);
        $this->assertSame('admin', $decoded->role);
        $this->assertSame('approved', $decoded->status);
        $this->assertGreaterThan(time(), $decoded->exp);
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Unit\Domain\Auth;

use App\Domain\Auth\Exception\DuplicateEmailException;
use App\Domain\Auth\Exception\InvalidCredentialsException;
use App\Domain\Auth\Exception\UserNotApprovedException;
use PHPUnit\Framework\TestCase;

class ExceptionsTest extends TestCase
{
    public function testDuplicateEmailExceptionExtendsDomainException(): void
    {
        $e = new DuplicateEmailException('alice@test.com');
        $this->assertInstanceOf(\DomainException::class, $e);
        $this->assertStringContainsString('alice@test.com', $e->getMessage());
    }

    public function testUserNotApprovedExceptionExtendsDomainException(): void
    {
        $e = new UserNotApprovedException();
        $this->assertInstanceOf(\DomainException::class, $e);
        $this->assertNotEmpty($e->getMessage());
    }

    public function testInvalidCredentialsExceptionExtendsDomainException(): void
    {
        $e = new InvalidCredentialsException();
        $this->assertInstanceOf(\DomainException::class, $e);
        $this->assertNotEmpty($e->getMessage());
    }
}

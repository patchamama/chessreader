<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Auth;

use App\Application\Auth\ListPendingUsersHandler;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

class ListPendingUsersHandlerTest extends TestCase
{
    public function testReturnsOnlyPendingUsers(): void
    {
        $pending = new User(new UserId(1), 'a@test.com', 'h', Role::User, RegistrationStatus::Pending, new DateTimeImmutable());
        $repo = $this->createMock(UserRepository::class);
        $repo->method('findAllPending')->willReturn([$pending]);

        $result = (new ListPendingUsersHandler($repo))->handle();

        $this->assertCount(1, $result);
        $this->assertSame(RegistrationStatus::Pending, $result[0]->status());
    }
}

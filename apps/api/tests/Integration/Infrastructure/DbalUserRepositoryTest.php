<?php

declare(strict_types=1);

namespace App\Tests\Integration\Infrastructure;

use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Infrastructure\Persistence\DbalUserRepository;
use DateTimeImmutable;
use Doctrine\DBAL\DriverManager;
use PHPUnit\Framework\TestCase;

class DbalUserRepositoryTest extends TestCase
{
    private DbalUserRepository $repo;

    protected function setUp(): void
    {
        $connection = DriverManager::getConnection([
            'driver' => 'pdo_sqlite',
            'memory' => true,
        ]);

        $migrationSql = file_get_contents(__DIR__ . '/../../../migrations/001_create_users.sql');
        $connection->executeStatement($migrationSql);

        $this->repo = new DbalUserRepository($connection);
    }

    public function testSaveAndFindByEmail(): void
    {
        $user = new User(new UserId(0), 'alice@test.com', 'hash', Role::User, RegistrationStatus::Pending, new DateTimeImmutable());
        $saved = $this->repo->save($user);

        $this->assertGreaterThan(0, $saved->id()->value());

        $found = $this->repo->findByEmail('alice@test.com');
        $this->assertNotNull($found);
        $this->assertSame('alice@test.com', $found->email());
        $this->assertSame(RegistrationStatus::Pending, $found->status());
    }

    public function testFindById(): void
    {
        $user = new User(new UserId(0), 'bob@test.com', 'hash', Role::User, RegistrationStatus::Pending, new DateTimeImmutable());
        $saved = $this->repo->save($user);

        $found = $this->repo->findById($saved->id());
        $this->assertNotNull($found);
        $this->assertSame('bob@test.com', $found->email());
    }

    public function testFindAllPendingReturnsOnlyPending(): void
    {
        $pending = new User(new UserId(0), 'pending@test.com', 'h', Role::User, RegistrationStatus::Pending, new DateTimeImmutable());
        $approved = new User(new UserId(0), 'approved@test.com', 'h', Role::User, RegistrationStatus::Approved, new DateTimeImmutable());
        $this->repo->save($pending);
        $this->repo->save($approved);

        $result = $this->repo->findAllPending();
        $this->assertCount(1, $result);
        $this->assertSame('pending@test.com', $result[0]->email());
    }

    public function testSaveUpdatesExistingUser(): void
    {
        $user = new User(new UserId(0), 'carol@test.com', 'h', Role::User, RegistrationStatus::Pending, new DateTimeImmutable());
        $saved = $this->repo->save($user);

        $updated = $this->repo->save($saved->withStatus(RegistrationStatus::Approved));

        $found = $this->repo->findById($saved->id());
        $this->assertSame(RegistrationStatus::Approved, $found->status());
    }

    public function testDuplicateEmailThrowsException(): void
    {
        $this->expectException(\Exception::class);

        $user1 = new User(new UserId(0), 'dup@test.com', 'h', Role::User, RegistrationStatus::Pending, new DateTimeImmutable());
        $user2 = new User(new UserId(0), 'dup@test.com', 'h', Role::User, RegistrationStatus::Pending, new DateTimeImmutable());
        $this->repo->save($user1);
        $this->repo->save($user2);
    }
}

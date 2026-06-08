<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use DateTimeImmutable;
use Doctrine\DBAL\Connection;

final class DbalUserRepository implements UserRepository
{
    public function __construct(private readonly Connection $connection)
    {
    }

    public function save(User $user): User
    {
        if ($user->id()->value() === 0) {
            // INSERT
            $this->connection->insert('users', [
                'email'                 => $user->email(),
                'password_hash'         => $user->passwordHash(),
                'role'                  => $user->role()->value,
                'registration_status'   => $user->status()->value,
                'created_at'            => $user->createdAt()->format('Y-m-d H:i:s'),
            ]);
            $id = (int) $this->connection->lastInsertId();
            return new User(new UserId($id), $user->email(), $user->passwordHash(), $user->role(), $user->status(), $user->createdAt());
        }

        // UPDATE
        $this->connection->update('users', [
            'email'               => $user->email(),
            'password_hash'       => $user->passwordHash(),
            'role'                => $user->role()->value,
            'registration_status' => $user->status()->value,
            'created_at'          => $user->createdAt()->format('Y-m-d H:i:s'),
        ], ['id' => $user->id()->value()]);

        return $user;
    }

    public function findByEmail(string $email): ?User
    {
        $row = $this->connection->fetchAssociative(
            'SELECT * FROM users WHERE email = ?',
            [$email]
        );

        return $row ? $this->hydrate($row) : null;
    }

    public function findById(UserId $id): ?User
    {
        $row = $this->connection->fetchAssociative(
            'SELECT * FROM users WHERE id = ?',
            [$id->value()]
        );

        return $row ? $this->hydrate($row) : null;
    }

    public function findAllPending(): array
    {
        $rows = $this->connection->fetchAllAssociative(
            "SELECT * FROM users WHERE registration_status = 'pending'"
        );

        return array_map($this->hydrate(...), $rows);
    }

    private function hydrate(array $row): User
    {
        return new User(
            new UserId((int) $row['id']),
            $row['email'],
            $row['password_hash'],
            Role::from($row['role']),
            RegistrationStatus::from($row['registration_status']),
            new DateTimeImmutable($row['created_at']),
        );
    }
}

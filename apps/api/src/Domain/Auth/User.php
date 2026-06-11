<?php

declare(strict_types=1);

namespace App\Domain\Auth;

use DateTimeImmutable;

final class User
{
    public function __construct(
        private readonly UserId $id,
        private readonly string $email,
        private readonly string $passwordHash,
        private readonly Role $role,
        private readonly RegistrationStatus $status,
        private readonly DateTimeImmutable $createdAt,
        private readonly int $loginCount = 0,
        private readonly ?int $lastReadBookId = null,
    ) {
    }

    public function id(): UserId
    {
        return $this->id;
    }

    public function email(): string
    {
        return $this->email;
    }

    public function passwordHash(): string
    {
        return $this->passwordHash;
    }

    public function role(): Role
    {
        return $this->role;
    }

    public function status(): RegistrationStatus
    {
        return $this->status;
    }

    public function createdAt(): DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function loginCount(): int
    {
        return $this->loginCount;
    }

    public function lastReadBookId(): ?int
    {
        return $this->lastReadBookId;
    }

    public function withStatus(RegistrationStatus $status): self
    {
        return new self(
            $this->id,
            $this->email,
            $this->passwordHash,
            $this->role,
            $status,
            $this->createdAt,
            $this->loginCount,
            $this->lastReadBookId,
        );
    }

    public function withLoginCount(int $loginCount): self
    {
        return new self(
            $this->id,
            $this->email,
            $this->passwordHash,
            $this->role,
            $this->status,
            $this->createdAt,
            $loginCount,
            $this->lastReadBookId,
        );
    }

    public function withLastReadBookId(?int $lastReadBookId): self
    {
        return new self(
            $this->id,
            $this->email,
            $this->passwordHash,
            $this->role,
            $this->status,
            $this->createdAt,
            $this->loginCount,
            $lastReadBookId,
        );
    }

    public function withPasswordHash(string $passwordHash): self
    {
        return new self(
            $this->id,
            $this->email,
            $passwordHash,
            $this->role,
            $this->status,
            $this->createdAt,
            $this->loginCount,
            $this->lastReadBookId,
        );
    }
}

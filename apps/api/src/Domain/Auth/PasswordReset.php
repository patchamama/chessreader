<?php

declare(strict_types=1);

namespace App\Domain\Auth;

use DateTimeImmutable;

final class PasswordReset
{
    public function __construct(
        private readonly int $id,
        private readonly int $userId,
        private readonly string $tokenHash,
        private readonly DateTimeImmutable $expiresAt,
        private readonly ?DateTimeImmutable $consumedAt,
        private readonly DateTimeImmutable $createdAt,
    ) {
    }

    public function id(): int
    {
        return $this->id;
    }

    public function userId(): int
    {
        return $this->userId;
    }

    public function tokenHash(): string
    {
        return $this->tokenHash;
    }

    public function expiresAt(): DateTimeImmutable
    {
        return $this->expiresAt;
    }

    public function consumedAt(): ?DateTimeImmutable
    {
        return $this->consumedAt;
    }

    public function createdAt(): DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function isExpired(DateTimeImmutable $now): bool
    {
        return $this->expiresAt <= $now;
    }

    public function isConsumed(): bool
    {
        return $this->consumedAt !== null;
    }

    public function consume(DateTimeImmutable $now): self
    {
        return new self(
            $this->id,
            $this->userId,
            $this->tokenHash,
            $this->expiresAt,
            $now,
            $this->createdAt,
        );
    }
}

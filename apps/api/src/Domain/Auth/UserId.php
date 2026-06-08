<?php

declare(strict_types=1);

namespace App\Domain\Auth;

final class UserId
{
    public function __construct(private readonly int $value)
    {
    }

    public function value(): int
    {
        return $this->value;
    }
}

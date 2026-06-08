<?php

declare(strict_types=1);

namespace App\Application\Auth\Command;

final class RejectUserCommand
{
    public function __construct(public readonly int $userId)
    {
    }
}

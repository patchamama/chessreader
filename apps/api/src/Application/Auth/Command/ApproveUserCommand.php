<?php

declare(strict_types=1);

namespace App\Application\Auth\Command;

final class ApproveUserCommand
{
    public function __construct(public readonly int $userId)
    {
    }
}

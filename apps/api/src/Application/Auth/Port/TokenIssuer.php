<?php

declare(strict_types=1);

namespace App\Application\Auth\Port;

use App\Domain\Auth\User;

interface TokenIssuer
{
    public function issue(User $user): string;
}

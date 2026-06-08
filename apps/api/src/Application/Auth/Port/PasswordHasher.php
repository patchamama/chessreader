<?php

declare(strict_types=1);

namespace App\Application\Auth\Port;

interface PasswordHasher
{
    public function hash(string $plainPassword): string;

    public function verify(string $plainPassword, string $hash): bool;
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Auth;

use App\Application\Auth\Port\PasswordHasher;

final class BcryptPasswordHasher implements PasswordHasher
{
    public function hash(string $plainPassword): string
    {
        return password_hash($plainPassword, PASSWORD_BCRYPT);
    }

    public function verify(string $plainPassword, string $hash): bool
    {
        return password_verify($plainPassword, $hash);
    }
}

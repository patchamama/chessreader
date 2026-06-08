<?php

declare(strict_types=1);

namespace App\Infrastructure\Auth;

use App\Application\Auth\Port\TokenIssuer;
use App\Domain\Auth\User;
use Firebase\JWT\JWT;

final class JwtTokenIssuer implements TokenIssuer
{
    public function __construct(private readonly string $secret)
    {
    }

    public function issue(User $user): string
    {
        $payload = [
            'sub'    => $user->id()->value(),
            'email'  => $user->email(),
            'role'   => $user->role()->value,
            'status' => $user->status()->value,
            'exp'    => time() + 3600,
        ];

        return JWT::encode($payload, $this->secret, 'HS256');
    }
}

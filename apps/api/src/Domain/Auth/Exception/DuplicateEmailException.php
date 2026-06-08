<?php

declare(strict_types=1);

namespace App\Domain\Auth\Exception;

class DuplicateEmailException extends \DomainException
{
    public function __construct(string $email)
    {
        parent::__construct("Email already registered: {$email}");
    }
}

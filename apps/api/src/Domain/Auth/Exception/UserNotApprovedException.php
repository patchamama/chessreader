<?php

declare(strict_types=1);

namespace App\Domain\Auth\Exception;

class UserNotApprovedException extends \DomainException
{
    public function __construct()
    {
        parent::__construct('User account is not approved.');
    }
}

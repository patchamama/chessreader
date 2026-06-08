<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure;

use App\Infrastructure\Auth\BcryptPasswordHasher;
use PHPUnit\Framework\TestCase;

class BcryptPasswordHasherTest extends TestCase
{
    public function testHashProducesVerifiableHash(): void
    {
        $hasher = new BcryptPasswordHasher();
        $hash = $hasher->hash('mysecret');

        $this->assertNotSame('mysecret', $hash);
        $this->assertTrue($hasher->verify('mysecret', $hash));
    }

    public function testVerifyReturnsFalseForWrongPassword(): void
    {
        $hasher = new BcryptPasswordHasher();
        $hash = $hasher->hash('correct');
        $this->assertFalse($hasher->verify('wrong', $hash));
    }
}

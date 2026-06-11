<?php

declare(strict_types=1);

namespace App\Tests\Unit\Domain\Auth;

use App\Domain\Auth\PasswordReset;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

class PasswordResetTest extends TestCase
{
    private function makeReset(
        ?DateTimeImmutable $expiresAt = null,
        ?DateTimeImmutable $consumedAt = null,
    ): PasswordReset {
        return new PasswordReset(
            id:         1,
            userId:     10,
            tokenHash:  'abc123hash',
            expiresAt:  $expiresAt ?? new DateTimeImmutable('+24 hours'),
            consumedAt: $consumedAt,
            createdAt:  new DateTimeImmutable(),
        );
    }

    public function testIsExpiredFalseWhenExpiresAtIsInFuture(): void
    {
        $reset = $this->makeReset(expiresAt: new DateTimeImmutable('+1 hour'));
        $this->assertFalse($reset->isExpired(new DateTimeImmutable()));
    }

    public function testIsExpiredTrueWhenExpiresAtIsInPast(): void
    {
        $reset = $this->makeReset(expiresAt: new DateTimeImmutable('-1 second'));
        $this->assertTrue($reset->isExpired(new DateTimeImmutable()));
    }

    public function testIsConsumedFalseWhenConsumedAtIsNull(): void
    {
        $reset = $this->makeReset(consumedAt: null);
        $this->assertFalse($reset->isConsumed());
    }

    public function testIsConsumedTrueWhenConsumedAtIsSet(): void
    {
        $reset = $this->makeReset(consumedAt: new DateTimeImmutable('-1 minute'));
        $this->assertTrue($reset->isConsumed());
    }

    public function testConsumeReturnsNewImmutableInstanceWithConsumedAtSet(): void
    {
        $reset = $this->makeReset();
        $now = new DateTimeImmutable();
        $consumed = $reset->consume($now);

        $this->assertNotSame($reset, $consumed);
        $this->assertFalse($reset->isConsumed());
        $this->assertTrue($consumed->isConsumed());
        $this->assertSame($now, $consumed->consumedAt());
    }
}

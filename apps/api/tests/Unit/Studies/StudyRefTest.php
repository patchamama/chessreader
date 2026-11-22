<?php

declare(strict_types=1);

namespace App\Tests\Unit\Studies;

use App\Application\Studies\StudyRef;
use PHPUnit\Framework\TestCase;

final class StudyRefTest extends TestCase
{
    public function test_accepts_urls_and_ids(): void
    {
        self::assertSame('T5T0MhwR', StudyRef::id('https://lichess.org/study/T5T0MhwR/tMH87FE3'));
        self::assertSame('T5T0MhwR', StudyRef::id('lichess.org/study/T5T0MhwR'));
        self::assertSame('T5T0MhwR', StudyRef::id(' T5T0MhwR '));
        self::assertSame('T5T0MhwR', StudyRef::id('https://lichess.org/study/T5T0MhwR/tMH87FE3#12'));
    }

    public function test_rejects_everything_else(): void
    {
        foreach (['', 'short', 'toolongidentifier', 'https://example.com/study/T5T0MhwR', 'T5T0Mh!R', 'https://lichess.org/@/bob'] as $bad) {
            self::assertNull(StudyRef::id($bad), $bad);
        }
    }
}

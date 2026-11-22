<?php

declare(strict_types=1);

namespace App\Application\Studies;

/** A Lichess call (needsToken: refused while anonymous, so a token may help; that failed: $status is the HTTP status (0 = network), $retryAfter the seconds asked on a 429. */
final class LichessStudyException extends \RuntimeException
{
    public function __construct(public readonly int $status, string $message, public readonly ?int $retryAfter = null, public readonly bool $needsToken = false)
    {
        parent::__construct($message);
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Llm;

/**
 * A refused or failed model call. The message is safe to show the user: it
 * never contains the API key.
 *
 * errorCode: config | auth | rate_limit | network | refusal | truncated | empty | provider
 */
final class LlmProxyException extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status, public readonly string $errorCode)
    {
        parent::__construct($message);
    }

    public static function config(string $message): self
    {
        return new self($message, 400, 'config');
    }
}

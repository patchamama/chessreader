<?php

declare(strict_types=1);

namespace App\Application\Narration;

/** Which voice says the narration and how. */
final class VoiceOptions
{
    public const PROVIDERS = ['system', 'piper', 'openai', 'elevenlabs'];

    public function __construct(
        /** system (the server's own voices), piper (free neural voices), openai, elevenlabs */
        public readonly string $provider = 'system',
        /** Voice name or id; empty = the provider's default for the language. */
        public readonly string $voice = '',
        /** Speed, 1.0 = normal. */
        public readonly float $rate = 1.0,
        /** Key for a paid provider. Used for the request only; never stored or logged. */
        public readonly string $apiKey = '',
        /** Model of the provider, when it has several. */
        public readonly string $model = '',
    ) {
    }

    /** @param array<string,mixed> $data */
    public static function fromArray(array $data): self
    {
        $provider = (string) ($data['provider'] ?? 'system');
        if (!in_array($provider, self::PROVIDERS, true)) {
            throw new \InvalidArgumentException('unknown voice provider: ' . $provider);
        }
        return new self(
            provider: $provider,
            voice: trim((string) ($data['voice'] ?? '')),
            rate: max(0.5, min(2.0, (float) ($data['rate'] ?? 1.0))),
            apiKey: trim((string) ($data['apiKey'] ?? '')),
            model: trim((string) ($data['model'] ?? '')),
        );
    }
}

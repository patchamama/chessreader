<?php

declare(strict_types=1);

namespace App\Application\Narration\Port;

use App\Application\Narration\VoiceOptions;

/** Turns a sentence into speech. */
interface SpeechSynthesizer
{
    /**
     * Writes `$text` spoken in `$lang` to `$wavPath` as a WAV file.
     *
     * @throws \RuntimeException when the voice cannot be produced (the message is shown to the user)
     */
    public function synthesize(string $text, string $lang, VoiceOptions $voice, string $wavPath): void;
}

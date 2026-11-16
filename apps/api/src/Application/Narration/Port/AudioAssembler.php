<?php

declare(strict_types=1);

namespace App\Application\Narration\Port;

/** Joins spoken segments into one audio file. */
interface AudioAssembler
{
    /**
     * Concatenates the WAV files, with `$gapSeconds` of silence between them, into one MP3.
     *
     * @param list<string> $wavPaths
     */
    public function assemble(array $wavPaths, float $gapSeconds, string $mp3Path): void;
}

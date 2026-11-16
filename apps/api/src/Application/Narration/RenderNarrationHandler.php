<?php

declare(strict_types=1);

namespace App\Application\Narration;

use App\Application\Narration\Port\AudioAssembler;
use App\Application\Narration\Port\SpeechSynthesizer;

/**
 * Renders a narration to one MP3: each segment is spoken on its own, measured,
 * and all are joined with a short silence between them. The measured lengths
 * are what lets the caller place every move and board cue on the audio.
 */
final class RenderNarrationHandler
{
    public const MAX_SEGMENTS = 2000;

    public function __construct(
        private readonly SpeechSynthesizer $synthesizer,
        private readonly AudioAssembler $assembler,
        private readonly string $outputDir,
    ) {
    }

    public function handle(RenderNarrationCommand $command): RenderedNarration
    {
        $segments = array_values(array_filter(array_map('trim', $command->segments), fn(string $s) => $s !== ''));
        if ($segments === [] || count($segments) !== count($command->segments)) {
            throw new \InvalidArgumentException($command->segments === [] ? 'segments are required' : 'segments must not be empty');
        }
        if (count($segments) > self::MAX_SEGMENTS) {
            throw new \InvalidArgumentException('too many segments (max ' . self::MAX_SEGMENTS . ')');
        }
        if (!is_dir($this->outputDir) && !mkdir($this->outputDir, 0775, true) && !is_dir($this->outputDir)) {
            throw new \RuntimeException('cannot create the audio folder');
        }

        $id   = bin2hex(random_bytes(12));
        $gap  = max(0.0, min(3.0, $command->gapSeconds));
        $wavs = [];
        try {
            $durations = [];
            foreach ($segments as $i => $text) {
                $wav    = sprintf('%s/%s-%04d.wav', $this->outputDir, $id, $i);
                $wavs[] = $wav;
                $this->synthesizer->synthesize($text, $command->lang, $command->voice, $wav);
                $durations[] = round(WavFile::duration($wav), 3);
            }
            $this->assembler->assemble($wavs, $gap, $this->outputDir . '/' . $id . '.mp3');
        } finally {
            foreach ($wavs as $wav) {
                @unlink($wav);
            }
        }

        return new RenderedNarration($id, $durations, round(array_sum($durations) + $gap * (count($durations) - 1), 3));
    }
}

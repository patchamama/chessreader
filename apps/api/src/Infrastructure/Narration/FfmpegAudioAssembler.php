<?php

declare(strict_types=1);

namespace App\Infrastructure\Narration;

use App\Application\Narration\Port\AudioAssembler;
use App\Application\Narration\WavFile;

/** Joins the segments with ffmpeg into a mono MP3. */
final class FfmpegAudioAssembler implements AudioAssembler
{
    public function assemble(array $wavPaths, float $gapSeconds, string $mp3Path): void
    {
        $ffmpeg = Shell::find('ffmpeg');
        if ($ffmpeg === null) {
            throw new \RuntimeException('ffmpeg is not installed on the server; it is needed to build the MP3');
        }
        $dir     = dirname($mp3Path);
        $silence = $dir . '/' . basename($mp3Path, '.mp3') . '-gap.wav';
        $list    = $dir . '/' . basename($mp3Path, '.mp3') . '-list.txt';
        try {
            WavFile::writeSilence($silence, $gapSeconds);
            $lines = [];
            foreach ($wavPaths as $i => $wav) {
                if ($i > 0 && $gapSeconds > 0) {
                    $lines[] = "file '" . str_replace("'", "'\\''", $silence) . "'";
                }
                $lines[] = "file '" . str_replace("'", "'\\''", $wav) . "'";
            }
            file_put_contents($list, implode("\n", $lines) . "\n");
            Shell::run([
                $ffmpeg, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', $list,
                '-ac', '1', '-ar', (string) WavFile::RATE, '-c:a', 'libmp3lame', '-b:a', '64k', $mp3Path,
            ], null, 600);
        } finally {
            @unlink($silence);
            @unlink($list);
        }
    }

    /** Any audio file → the WAV shape every segment must have (24 kHz, mono, 16 bit). */
    public static function toWav(string $input, string $wavPath, float $tempo = 1.0): void
    {
        $ffmpeg = Shell::find('ffmpeg');
        if ($ffmpeg === null) {
            throw new \RuntimeException('ffmpeg is not installed on the server; it is needed to build the MP3');
        }
        $filter = abs($tempo - 1.0) > 0.01 ? ['-filter:a', 'atempo=' . number_format($tempo, 2, '.', '')] : [];
        Shell::run(array_merge(
            [$ffmpeg, '-y', '-loglevel', 'error', '-i', $input],
            $filter,
            ['-ac', '1', '-ar', (string) WavFile::RATE, '-c:a', 'pcm_s16le', $wavPath],
        ));
    }
}

<?php

declare(strict_types=1);

namespace App\Application\Narration;

/** Minimal WAV reading/writing: enough to time a segment exactly. */
final class WavFile
{
    public const RATE = 24000;

    /** Length of the audio in seconds, from the header and the data size. */
    public static function duration(string $path): float
    {
        $h = @fopen($path, 'rb');
        if ($h === false) {
            throw new \RuntimeException('cannot read audio segment');
        }
        try {
            $riff = fread($h, 12);
            if ($riff === false || strlen($riff) < 12 || substr($riff, 0, 4) !== 'RIFF' || substr($riff, 8, 4) !== 'WAVE') {
                throw new \RuntimeException('audio segment is not a WAV file');
            }
            $byteRate = 0;
            while (!feof($h)) {
                $head = fread($h, 8);
                if ($head === false || strlen($head) < 8) {
                    break;
                }
                $id   = substr($head, 0, 4);
                $size = unpack('V', substr($head, 4, 4))[1];
                if ($id === 'fmt ') {
                    $fmt      = fread($h, $size);
                    $byteRate = unpack('V', substr((string) $fmt, 8, 4))[1];
                } elseif ($id === 'data') {
                    if ($byteRate <= 0) {
                        break;
                    }
                    // Streamed WAVs leave the size open (0xFFFFFFFF): use what is in the file.
                    $left = filesize($path) - ftell($h);
                    return min($size, $left) / $byteRate;
                } else {
                    fseek($h, $size + ($size % 2), SEEK_CUR);
                }
            }
        } finally {
            fclose($h);
        }
        throw new \RuntimeException('audio segment has no sound data');
    }

    /** Writes `$seconds` of silence (16-bit mono). */
    public static function writeSilence(string $path, float $seconds): void
    {
        $samples = (int) round($seconds * self::RATE);
        $data    = str_repeat("\0", $samples * 2);
        $header  = 'RIFF' . pack('V', 36 + strlen($data)) . 'WAVE'
            . 'fmt ' . pack('VvvVVvv', 16, 1, 1, self::RATE, self::RATE * 2, 2, 16)
            . 'data' . pack('V', strlen($data));
        file_put_contents($path, $header . $data);
    }
}

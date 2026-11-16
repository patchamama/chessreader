<?php

declare(strict_types=1);

namespace App\Tests\Integration\Infrastructure\Narration;

use App\Application\Narration\RenderNarrationCommand;
use App\Application\Narration\RenderNarrationHandler;
use App\Application\Narration\VoiceOptions;
use App\Infrastructure\Narration\FfmpegAudioAssembler;
use App\Infrastructure\Narration\RoutingSpeechSynthesizer;
use App\Infrastructure\Narration\Shell;
use PHPUnit\Framework\TestCase;

/** Real voice + real ffmpeg. Skipped where the machine has neither. */
final class RealRenderTest extends TestCase
{
    public function test_the_mp3_is_as_long_as_the_segments_plus_the_gaps(): void
    {
        $hasVoice = PHP_OS_FAMILY === 'Darwin' || PHP_OS_FAMILY === 'Windows' || Shell::find('espeak-ng') !== null;
        if (Shell::find('ffmpeg') === null || Shell::find('ffprobe') === null || !$hasVoice) {
            $this->markTestSkipped('needs ffmpeg and a system voice');
        }
        $dir = sys_get_temp_dir() . '/narration-real-' . bin2hex(random_bytes(4));
        $handler = new RenderNarrationHandler(new RoutingSpeechSynthesizer(), new FfmpegAudioAssembler(), $dir);
        try {
            $result = $handler->handle(new RenderNarrationCommand(
                ['1. peón a e 4', 'caballo efe 3, jaque', 'Las blancas dominan el centro.'], 'es', new VoiceOptions('system'), 0.3,
            ));
            $mp3 = $dir . '/' . $result->id . '.mp3';
            $this->assertFileExists($mp3);
            foreach ($result->durations as $d) {
                $this->assertGreaterThan(0.3, $d);
            }
            $probed = (float) trim(Shell::run([Shell::find('ffprobe'), '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', $mp3]));
            $this->assertEqualsWithDelta($result->total, $probed, 0.15);
        } finally {
            array_map('unlink', glob($dir . '/*') ?: []);
            @rmdir($dir);
        }
    }
}

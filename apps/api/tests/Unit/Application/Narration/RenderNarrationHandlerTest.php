<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Narration;

use App\Application\Narration\Port\AudioAssembler;
use App\Application\Narration\Port\SpeechSynthesizer;
use App\Application\Narration\RenderNarrationCommand;
use App\Application\Narration\RenderNarrationHandler;
use App\Application\Narration\VoiceOptions;
use App\Application\Narration\WavFile;
use PHPUnit\Framework\TestCase;

final class RenderNarrationHandlerTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/narration-test-' . bin2hex(random_bytes(4));
        mkdir($this->dir, 0777, true);
    }

    protected function tearDown(): void
    {
        array_map('unlink', array_merge(glob($this->dir . '/*') ?: [], glob($this->dir . '/.renders-*') ?: []));
        @rmdir($this->dir);
    }

    /** A voice that "says" one tenth of a second per character. */
    private function synthesizer(array &$said): SpeechSynthesizer
    {
        return new class($said) implements SpeechSynthesizer {
            public function __construct(private array &$said)
            {
            }

            public function synthesize(string $text, string $lang, VoiceOptions $voice, string $wavPath): void
            {
                $this->said[] = [$text, $lang, $voice->provider];
                WavFile::writeSilence($wavPath, strlen($text) / 10);
            }
        };
    }

    private function assembler(array &$calls): AudioAssembler
    {
        return new class($calls) implements AudioAssembler {
            public function __construct(private array &$calls)
            {
            }

            public function assemble(array $wavPaths, float $gapSeconds, string $mp3Path): void
            {
                $this->calls[] = [count($wavPaths), $gapSeconds];
                file_put_contents($mp3Path, 'mp3');
            }
        };
    }

    public function test_it_synthesises_every_segment_in_order_and_measures_each_one(): void
    {
        $said = [];
        $calls = [];
        $handler = new RenderNarrationHandler($this->synthesizer($said), $this->assembler($calls), $this->dir);

        $result = $handler->handle(new RenderNarrationCommand(
            segments: ['1. peón a e 4', 'caballo'],
            lang: 'es',
            voice: new VoiceOptions(provider: 'system'),
            gapSeconds: 0.25,
        ));

        $this->assertSame([['1. peón a e 4', 'es', 'system'], ['caballo', 'es', 'system']], $said);
        $this->assertEqualsWithDelta([1.4, 0.7], $result->durations, 0.001); // "ó" is two bytes
        $this->assertEqualsWithDelta(1.4 + 0.25 + 0.7, $result->total, 0.001);
        $this->assertSame([[2, 0.25]], $calls);
        $this->assertFileExists($this->dir . '/' . $result->id . '.mp3');
        $this->assertMatchesRegularExpression('/^[a-f0-9]{24}$/', $result->id);
    }

    public function test_it_leaves_no_temporary_files_behind(): void
    {
        $said = [];
        $calls = [];
        $handler = new RenderNarrationHandler($this->synthesizer($said), $this->assembler($calls), $this->dir);
        $result = $handler->handle(new RenderNarrationCommand(['hola'], 'es', new VoiceOptions('system'), 0.2));
        $this->assertSame([$result->id . '.mp3'], array_map('basename', glob($this->dir . '/*')));
    }

    public function test_it_refuses_an_empty_narration_and_too_many_segments(): void
    {
        $said = [];
        $calls = [];
        $handler = new RenderNarrationHandler($this->synthesizer($said), $this->assembler($calls), $this->dir);
        try {
            $handler->handle(new RenderNarrationCommand([], 'es', new VoiceOptions('system'), 0.2));
            $this->fail('expected an exception');
        } catch (\InvalidArgumentException $e) {
            $this->assertSame('segments are required', $e->getMessage());
        }
        $this->expectException(\InvalidArgumentException::class);
        $handler->handle(new RenderNarrationCommand(array_fill(0, 2001, 'a'), 'es', new VoiceOptions('system'), 0.2));
    }

    public function test_wav_duration_is_read_from_the_file(): void
    {
        $path = $this->dir . '/x.wav';
        WavFile::writeSilence($path, 1.5);
        $this->assertEqualsWithDelta(1.5, WavFile::duration($path), 0.001);
    }

    public function test_old_audio_files_are_removed_when_a_new_one_is_rendered(): void
    {
        $said = [];
        $calls = [];
        file_put_contents($this->dir . '/aaaaaaaaaaaaaaaaaaaaaaaa.mp3', 'old');
        touch($this->dir . '/aaaaaaaaaaaaaaaaaaaaaaaa.mp3', time() - 2 * 86400);
        file_put_contents($this->dir . '/bbbbbbbbbbbbbbbbbbbbbbbb.mp3', 'recent');
        $handler = new RenderNarrationHandler($this->synthesizer($said), $this->assembler($calls), $this->dir);
        $handler->handle(new RenderNarrationCommand(['Hola'], 'es', VoiceOptions::fromArray([]), 0.2));
        $this->assertFileDoesNotExist($this->dir . '/aaaaaaaaaaaaaaaaaaaaaaaa.mp3');
        $this->assertFileExists($this->dir . '/bbbbbbbbbbbbbbbbbbbbbbbb.mp3');
    }

    public function test_a_user_can_render_only_so_many_narrations_per_hour(): void
    {
        $said = [];
        $calls = [];
        $handler = new RenderNarrationHandler($this->synthesizer($said), $this->assembler($calls), $this->dir);
        for ($i = 0; $i < RenderNarrationHandler::MAX_RENDERS_PER_HOUR; $i++) {
            $handler->handle(new RenderNarrationCommand(['a'], 'es', VoiceOptions::fromArray([]), 0.0, owner: '7'));
        }
        $handler->handle(new RenderNarrationCommand(['a'], 'es', VoiceOptions::fromArray([]), 0.0, owner: '8'));
        $this->expectException(\OverflowException::class);
        $handler->handle(new RenderNarrationCommand(['a'], 'es', VoiceOptions::fromArray([]), 0.0, owner: '7'));
    }

    public function test_a_pause_segment_is_silence_of_that_length_not_speech(): void
    {
        $said = [];
        $calls = [];
        $handler = new RenderNarrationHandler($this->synthesizer($said), $this->assembler($calls), $this->dir);
        $result = $handler->handle(new RenderNarrationCommand(['Volvamos a la partida', '[pause 2]', 'peón e 4'], 'es', VoiceOptions::fromArray([]), 0.0));
        $this->assertSame(['Volvamos a la partida', 'peón e 4'], array_column($said, 0));
        $this->assertEqualsWithDelta(2.0, $result->durations[1], 0.001);
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure;

use App\Application\Narration\Port\AudioAssembler;
use App\Application\Narration\Port\SpeechSynthesizer;
use App\Application\Narration\RenderNarrationCommand;
use App\Application\Narration\RenderNarrationHandler;
use App\Application\Narration\VoiceOptions;
use App\Infrastructure\Narration\RoutingSpeechSynthesizer;
use PHPUnit\Framework\TestCase;

final class NarrationHardeningTest extends TestCase
{
    public function test_the_windows_voice_name_never_becomes_script_text(): void
    {
        // U+2019 is a quote delimiter for PowerShell: it must not reach the script.
        $evil = "x\u{2019}); Remove-Item C:\\ -Recurse; #";
        [$command, $env] = RoutingSpeechSynthesizer::windowsCommand(new VoiceOptions('system', $evil, 1.5), 'C:\\out.wav');
        $script = implode(' ', $command);
        $this->assertStringNotContainsString('Remove-Item', $script);
        $this->assertStringNotContainsString("\u{2019}", $script);
        $this->assertSame($evil, $env['CHESSREADER_VOICE']);
        $this->assertSame('C:\\out.wav', $env['CHESSREADER_OUT']);
        $this->assertStringContainsString('$env:CHESSREADER_VOICE', $script);
        $this->assertSame('5', $env['CHESSREADER_RATE']);
    }

    public function test_speech_commands_embedded_in_the_text_are_neutralised(): void
    {
        $this->assertSame('a slnc 30000 b', RoutingSpeechSynthesizer::plainText('a [[slnc 30000]] b'));
        $this->assertSame('Caballo por e 5, jaque.', RoutingSpeechSynthesizer::plainText('Caballo por e 5, jaque.'));
    }

    public function test_a_piper_voice_cannot_name_a_path(): void
    {
        $synth = new RoutingSpeechSynthesizer(['piper_bin' => '/bin/echo', 'piper_models_dir' => sys_get_temp_dir()]);
        foreach (['../../etc/passwd', '/etc/passwd', 'a/b', 'C:\\x'] as $voice) {
            try {
                $synth->synthesize('hola', 'es', new VoiceOptions('piper', $voice), sys_get_temp_dir() . '/x.wav');
                $this->fail('expected a refusal for ' . $voice);
            } catch (\RuntimeException $e) {
                $this->assertSame('the piper voice must be the name of a model in the models folder', $e->getMessage());
            }
        }
    }

    public function test_a_segment_longer_than_the_limit_is_refused(): void
    {
        $handler = new RenderNarrationHandler(
            $this->createMock(SpeechSynthesizer::class),
            $this->createMock(AudioAssembler::class),
            sys_get_temp_dir() . '/narration-limit-test',
        );
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('a segment is too long (max 2000 characters)');
        $handler->handle(new RenderNarrationCommand([str_repeat('a', 2001)], 'es', new VoiceOptions('system'), 0.2));
    }
}

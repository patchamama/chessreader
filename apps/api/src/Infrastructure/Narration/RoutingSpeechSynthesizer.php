<?php

declare(strict_types=1);

namespace App\Infrastructure\Narration;

use App\Application\Narration\Port\SpeechSynthesizer;
use App\Application\Narration\VoiceOptions;

/**
 * Speech from the provider the user chose:
 *  - system:     the voices of the server's operating system (macOS `say`,
 *                Linux `espeak-ng`, Windows SAPI through PowerShell);
 *  - piper:      free neural voices run locally (https://github.com/rhasspy/piper);
 *  - openai:     OpenAI text-to-speech (paid, needs a key);
 *  - elevenlabs: ElevenLabs text-to-speech (paid, needs a key).
 * Anthropic has no text-to-speech API, so it is not a provider.
 */
final class RoutingSpeechSynthesizer implements SpeechSynthesizer
{
    private const SYSTEM_DEFAULT = [
        'Darwin' => ['es' => 'Mónica', 'en' => 'Samantha', 'de' => 'Anna'],
    ];

    /** @param array<string,string> $config piper_bin, piper_models_dir, openai_key, elevenlabs_key */
    public function __construct(private readonly array $config = [])
    {
    }

    public function synthesize(string $text, string $lang, VoiceOptions $voice, string $wavPath): void
    {
        $raw  = $wavPath . '.raw';
        $text = self::plainText($text);
        try {
            match ($voice->provider) {
                'system'     => $this->system($text, $lang, $voice, $raw),
                'piper'      => $this->piper($text, $lang, $voice, $raw),
                'openai'     => $this->openai($text, $voice, $raw),
                'elevenlabs' => $this->elevenlabs($text, $voice, $raw),
                default      => throw new \RuntimeException('unknown voice provider: ' . $voice->provider),
            };
            // Cloud voices take the speed in the request; local ones are sped up here.
            $tempo = in_array($voice->provider, ['openai'], true) ? 1.0 : $voice->rate;
            $tempo = $voice->provider === 'system' ? 1.0 : $tempo;
            FfmpegAudioAssembler::toWav($raw, $wavPath, $tempo);
        } finally {
            @unlink($raw);
        }
    }

    private function system(string $text, string $lang, VoiceOptions $voice, string $out): void
    {
        $os = PHP_OS_FAMILY;
        if ($os === 'Darwin') {
            $name = $voice->voice !== '' ? $voice->voice : (self::SYSTEM_DEFAULT['Darwin'][$lang] ?? '');
            $cmd  = ['/usr/bin/say', '-o', $out . '.aiff', '-r', (string) (int) round(175 * $voice->rate)];
            if ($name !== '') {
                array_push($cmd, '-v', $name);
            }
            $cmd[] = '--';
            $cmd[] = $text;
            try {
                Shell::run($cmd);
                rename($out . '.aiff', $out);
            } finally {
                @unlink($out . '.aiff');
            }
            return;
        }
        if ($os === 'Windows') {
            [$command, $env] = self::windowsCommand($voice, $out);
            Shell::run($command, $text, 120, $env);
            return;
        }
        $espeak = Shell::find('espeak-ng') ?? Shell::find('espeak');
        if ($espeak === null) {
            throw new \RuntimeException('no system voice on the server: install espeak-ng, or choose another provider');
        }
        // A voice name can never be read as an option.
        $name = preg_match('/^[A-Za-z][A-Za-z0-9+_-]{0,40}$/', $voice->voice) ? $voice->voice : $lang;
        Shell::run([$espeak, '-v', $name, '-s', (string) (int) round(165 * $voice->rate), '-w', $out, '--stdin'], $text);
    }

    private function piper(string $text, string $lang, VoiceOptions $voice, string $out): void
    {
        if ($voice->voice !== '' && !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/', $voice->voice)) {
            throw new \RuntimeException('the piper voice must be the name of a model in the models folder');
        }
        $bin = ($this->config['piper_bin'] ?? '') ?: Shell::find('piper');
        if ($bin === null || $bin === '') {
            throw new \RuntimeException('piper is not installed on the server (set PIPER_BIN, or install it from github.com/rhasspy/piper)');
        }
        $dir   = rtrim($this->config['piper_models_dir'] ?? '', '/');
        $model = $voice->voice;
        if ($model === '') {
            $found = $dir !== '' ? (glob($dir . '/' . $lang . '*.onnx') ?: []) : [];
            if ($found === []) {
                throw new \RuntimeException('no piper voice for "' . $lang . '": put a .onnx model in PIPER_MODELS_DIR or give its path as the voice');
            }
            $model = $found[0];
        } else {
            // Only the NAME of a model in the configured folder: never a path.
            if ($dir === '' || !preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/', $model)) {
                throw new \RuntimeException('the piper voice must be the name of a model in the models folder');
            }
            $model = $dir . '/' . $model . (str_ends_with($model, '.onnx') ? '' : '.onnx');
        }
        if (!is_file($model)) {
            throw new \RuntimeException('piper voice not found: ' . basename($model));
        }
        Shell::run([$bin, '--model', $model, '--output_file', $out], $text);
    }

    private function openai(string $text, VoiceOptions $voice, string $out): void
    {
        $key = $voice->apiKey !== '' ? $voice->apiKey : ($this->config['openai_key'] ?? '');
        if ($key === '') {
            throw new \RuntimeException('An API key is required for openai');
        }
        $this->http('https://api.openai.com/v1/audio/speech', ['Authorization: Bearer ' . $key], [
            'model'           => $voice->model !== '' ? $voice->model : 'gpt-4o-mini-tts',
            'voice'           => $voice->voice !== '' ? $voice->voice : 'alloy',
            'input'           => $text,
            'response_format' => 'mp3',
            'speed'           => $voice->rate,
        ], $out, 'OpenAI');
    }

    private function elevenlabs(string $text, VoiceOptions $voice, string $out): void
    {
        $key = $voice->apiKey !== '' ? $voice->apiKey : ($this->config['elevenlabs_key'] ?? '');
        if ($key === '') {
            throw new \RuntimeException('An API key is required for elevenlabs');
        }
        $id = $voice->voice !== '' ? $voice->voice : '21m00Tcm4TlvDq8ikWAM';
        if (!preg_match('/^[A-Za-z0-9]{10,40}$/', $id)) {
            throw new \RuntimeException('the ElevenLabs voice must be a voice id');
        }
        $this->http('https://api.elevenlabs.io/v1/text-to-speech/' . $id . '?output_format=mp3_44100_128', ['xi-api-key: ' . $key], [
            'text'     => $text,
            'model_id' => $voice->model !== '' ? $voice->model : 'eleven_multilingual_v2',
        ], $out, 'ElevenLabs');
    }

    /**
     * @param list<string> $headers
     * @param array<string,mixed> $body
     */
    private function http(string $url, array $headers, array $body, string $out, string $name): void
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => array_merge($headers, ['Content-Type: application/json']),
            CURLOPT_POSTFIELDS     => json_encode($body),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 90,
        ]);
        $data   = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error  = curl_error($ch);
        if ($data === false || $status < 200 || $status >= 300) {
            $detail = is_string($data) ? (json_decode($data, true)['error']['message'] ?? json_decode($data, true)['detail']['message'] ?? '') : $error;
            throw new \RuntimeException($name . ' refused the request (' . ($status ?: 'no answer') . ')' . ($detail !== '' ? ': ' . substr((string) $detail, 0, 200) : ''));
        }
        file_put_contents($out, $data);
    }

    /**
     * The Windows speech command. The voice name, the output path and the rate
     * travel as environment variables and the text on standard input: nothing
     * the user typed is ever part of the script PowerShell parses.
     *
     * @return array{0: list<string>, 1: array<string,string>}
     */
    public static function windowsCommand(VoiceOptions $voice, string $out): array
    {
        $script = 'Add-Type -AssemblyName System.Speech; '
            . '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; '
            . 'if ($env:CHESSREADER_VOICE) { $s.SelectVoice($env:CHESSREADER_VOICE) }; '
            . '$s.Rate = [int]$env:CHESSREADER_RATE; '
            . '$s.SetOutputToWaveFile($env:CHESSREADER_OUT); '
            . '$s.Speak([Console]::In.ReadToEnd()); $s.Dispose()';
        return [
            ['powershell', '-NoProfile', '-NonInteractive', '-Command', $script],
            [
                'CHESSREADER_VOICE' => $voice->voice,
                'CHESSREADER_OUT'   => $out,
                'CHESSREADER_RATE'  => (string) max(-10, min(10, (int) round(($voice->rate - 1) * 10))),
            ],
        ];
    }

    /** The text as plain words: speech engines read "[[…]]" as commands (macOS `say`). */
    public static function plainText(string $text): string
    {
        return trim((string) preg_replace('/\s+/', ' ', str_replace(['[[', ']]'], ' ', $text)));
    }

    /** Voices of the server's operating system, for the settings screen. */
    public static function systemVoices(): array
    {
        try {
            if (PHP_OS_FAMILY === 'Darwin') {
                $voices = [];
                foreach (explode("\n", Shell::run(['/usr/bin/say', '-v', '?'])) as $line) {
                    if (preg_match('/^(.+?)\s{2,}([a-z]{2})_([A-Z]{2})\s/u', $line, $m)) {
                        $voices[] = ['id' => trim($m[1]), 'name' => trim($m[1]), 'lang' => $m[2]];
                    }
                }
                return $voices;
            }
            if (PHP_OS_FAMILY === 'Windows') {
                $out = Shell::run(['powershell', '-NoProfile', '-Command',
                    'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | % { $_.VoiceInfo.Name + "|" + $_.VoiceInfo.Culture.TwoLetterISOLanguageName }']);
                return array_values(array_filter(array_map(function (string $l) {
                    $p = explode('|', trim($l));
                    return count($p) === 2 ? ['id' => $p[0], 'name' => $p[0], 'lang' => $p[1]] : null;
                }, explode("\n", $out))));
            }
            $espeak = Shell::find('espeak-ng') ?? Shell::find('espeak');
            if ($espeak === null) {
                return [];
            }
            $voices = [];
            foreach (array_slice(explode("\n", Shell::run([$espeak, '--voices'])), 1) as $line) {
                $p = preg_split('/\s+/', trim($line));
                if (is_array($p) && count($p) >= 4) {
                    $voices[] = ['id' => $p[1], 'name' => $p[3], 'lang' => substr($p[1], 0, 2)];
                }
            }
            return $voices;
        } catch (\RuntimeException) {
            return [];
        }
    }
}

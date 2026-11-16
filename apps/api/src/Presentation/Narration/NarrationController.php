<?php

declare(strict_types=1);

namespace App\Presentation\Narration;

use App\Application\Narration\RenderNarrationCommand;
use App\Application\Narration\RenderNarrationHandler;
use App\Application\Narration\VoiceOptions;
use App\Infrastructure\Narration\RoutingSpeechSynthesizer;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class NarrationController
{
    public function __construct(
        private readonly RenderNarrationHandler $handler,
        private readonly string $audioDir,
    ) {
    }

    /** POST /api/narration/render — segments in, one MP3 and the length of every segment out. */
    public function render(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body     = (array) ($request->getParsedBody() ?? []);
        $segments = $body['segments'] ?? null;
        if (!is_array($segments) || $segments === []) {
            return $this->json($response, ['error' => 'segments are required'], 400);
        }
        try {
            $command = new RenderNarrationCommand(
                segments: array_values(array_map('strval', $segments)),
                lang: in_array($body['lang'] ?? 'es', ['es', 'en', 'de'], true) ? (string) ($body['lang'] ?? 'es') : 'es',
                voice: VoiceOptions::fromArray((array) ($body['voice'] ?? [])),
                gapSeconds: (float) ($body['gap'] ?? 0.25),
            );
            $result = $this->handler->handle($command);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 400);
        } catch (\RuntimeException $e) {
            // The voice (a program or a remote service) failed: say why.
            return $this->json($response, ['error' => $e->getMessage()], 502);
        }

        return $this->json($response, [
            'id'        => $result->id,
            'audioUrl'  => '/api/narration/audio/' . $result->id . '.mp3',
            'durations' => $result->durations,
            'total'     => $result->total,
        ]);
    }

    /** GET /api/narration/audio/{id}.mp3 */
    public function audio(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $path = $this->audioDir . '/' . $id . '.mp3';
        if (!preg_match('/^[a-f0-9]{24}$/', $id) || !is_file($path)) {
            return $this->json($response, ['error' => 'audio not found'], 404);
        }
        $response->getBody()->write((string) file_get_contents($path));
        return $response->withHeader('Content-Type', 'audio/mpeg')->withHeader('Content-Length', (string) filesize($path));
    }

    /** GET /api/narration/providers — what can speak on this server. */
    public function providers(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, [
            'providers' => [
                ['id' => 'system', 'name' => 'System voices (' . PHP_OS_FAMILY . ')', 'needsKey' => false, 'voices' => RoutingSpeechSynthesizer::systemVoices()],
                ['id' => 'piper', 'name' => 'Piper (free neural voices, local)', 'needsKey' => false, 'voices' => []],
                ['id' => 'openai', 'name' => 'OpenAI text-to-speech', 'needsKey' => true, 'voices' => array_map(
                    fn(string $v) => ['id' => $v, 'name' => ucfirst($v), 'lang' => ''],
                    ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'],
                )],
                ['id' => 'elevenlabs', 'name' => 'ElevenLabs', 'needsKey' => true, 'voices' => []],
            ],
            'note' => 'Anthropic offers no text-to-speech API.',
        ]);
    }

    /** @param array<string,mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

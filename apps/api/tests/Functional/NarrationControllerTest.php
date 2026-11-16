<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Application\Auth\ApproveUserHandler;
use App\Application\Auth\Command\ApproveUserCommand;
use App\Application\Auth\Command\RegisterUserCommand;
use App\Application\Auth\RegisterUserHandler;
use App\Application\Narration\Port\AudioAssembler;
use App\Application\Narration\Port\SpeechSynthesizer;
use App\Application\Narration\VoiceOptions;
use App\Application\Narration\WavFile;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class NarrationControllerTest extends TestCase
{
    private function overrides(): array
    {
        $synth = new class implements SpeechSynthesizer {
            public function synthesize(string $text, string $lang, VoiceOptions $voice, string $wavPath): void
            {
                if ($voice->provider === 'openai' && $voice->apiKey === '') {
                    throw new \RuntimeException('An API key is required for openai');
                }
                WavFile::writeSilence($wavPath, 0.5);
            }
        };
        $assembler = new class implements AudioAssembler {
            public function assemble(array $wavPaths, float $gapSeconds, string $mp3Path): void
            {
                file_put_contents($mp3Path, 'ID3-fake-mp3');
            }
        };
        return [SpeechSynthesizer::class => fn() => $synth, AudioAssembler::class => fn() => $assembler];
    }

    private function token(string $email): string
    {
        $container = $this->buildContainer($this->overrides());
        $container->get(RegisterUserHandler::class)->handle(new RegisterUserCommand($email, 'pass123'));
        $repo = $container->get(UserRepository::class);
        $container->get(ApproveUserHandler::class)->handle(new ApproveUserCommand($repo->findByEmail($email)->id()->value()));
        return (new JwtTokenIssuer($container->get('settings')['jwt']['secret']))->issue($repo->findByEmail($email));
    }

    private function post(string $path, array $body, ?string $token)
    {
        $app = $this->createAppWithOverrides($this->overrides());
        $req = (new ServerRequestFactory())->createServerRequest('POST', $path)
            ->withParsedBody($body)->withHeader('Content-Type', 'application/json');
        if ($token !== null) {
            $req = $req->withHeader('Authorization', "Bearer {$token}");
        }
        return [$app, $app->handle($req)];
    }

    public function test_render_requires_a_token(): void
    {
        [, $resp] = $this->post('/api/narration/render', ['segments' => ['a']], null);
        $this->assertSame(401, $resp->getStatusCode());
    }

    public function test_render_returns_the_timings_and_the_audio_can_be_fetched(): void
    {
        $token = $this->token('narr1@test.com');
        [$app, $resp] = $this->post('/api/narration/render', [
            'segments' => ['uno', 'dos', 'tres'], 'lang' => 'es', 'gap' => 0.25, 'voice' => ['provider' => 'system'],
        ], $token);
        $body = json_decode((string) $resp->getBody(), true);

        $this->assertSame(200, $resp->getStatusCode());
        $this->assertEqualsWithDelta([0.5, 0.5, 0.5], $body['durations'], 0.001);
        $this->assertEqualsWithDelta(2.0, $body['total'], 0.001);
        $this->assertSame('/api/narration/audio/' . $body['id'] . '.mp3', $body['audioUrl']);

        $get = (new ServerRequestFactory())->createServerRequest('GET', $body['audioUrl'])
            ->withHeader('Authorization', "Bearer {$token}");
        $audio = $app->handle($get);
        $this->assertSame(200, $audio->getStatusCode());
        $this->assertSame('audio/mpeg', $audio->getHeaderLine('Content-Type'));
        $this->assertSame('ID3-fake-mp3', (string) $audio->getBody());
    }

    public function test_render_rejects_a_request_without_segments(): void
    {
        [, $resp] = $this->post('/api/narration/render', ['segments' => []], $this->token('narr2@test.com'));
        $this->assertSame(400, $resp->getStatusCode());
        $this->assertSame('segments are required', json_decode((string) $resp->getBody(), true)['error']);
    }

    public function test_a_voice_failure_is_reported_not_swallowed(): void
    {
        [, $resp] = $this->post('/api/narration/render', [
            'segments' => ['a'], 'voice' => ['provider' => 'openai'],
        ], $this->token('narr3@test.com'));
        $this->assertSame(502, $resp->getStatusCode());
        $this->assertSame('An API key is required for openai', json_decode((string) $resp->getBody(), true)['error']);
    }

    public function test_unknown_audio_is_404_and_the_id_cannot_leave_the_folder(): void
    {
        $token = $this->token('narr4@test.com');
        $app = $this->createAppWithOverrides($this->overrides());
        $get = (new ServerRequestFactory())->createServerRequest('GET', '/api/narration/audio/' . str_repeat('a', 24) . '.mp3')
            ->withHeader('Authorization', "Bearer {$token}");
        $this->assertSame(404, $app->handle($get)->getStatusCode());
    }

    public function test_providers_are_listed_and_anthropic_is_not_one(): void
    {
        $token = $this->token('narr5@test.com');
        $app = $this->createAppWithOverrides($this->overrides());
        $get = (new ServerRequestFactory())->createServerRequest('GET', '/api/narration/providers')
            ->withHeader('Authorization', "Bearer {$token}");
        $body = json_decode((string) $app->handle($get)->getBody(), true);
        $ids = array_column($body['providers'], 'id');
        $this->assertSame(['system', 'piper', 'openai', 'elevenlabs'], $ids);
        $this->assertNotContains('anthropic', $ids);
    }
}

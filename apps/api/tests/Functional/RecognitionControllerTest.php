<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Application\Auth\ApproveUserHandler;
use App\Application\Auth\Command\ApproveUserCommand;
use App\Application\Auth\Command\RegisterUserCommand;
use App\Application\Auth\RegisterUserHandler;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class RecognitionControllerTest extends TestCase
{
    private function seedApprovedUser(string $email = 'recognizer@test.com'): array
    {
        $container = $this->buildContainer();
        $settings  = $container->get('settings');

        $registerHandler = $container->get(RegisterUserHandler::class);
        $approveHandler  = $container->get(ApproveUserHandler::class);
        $repo            = $container->get(UserRepository::class);

        $registerHandler->handle(new RegisterUserCommand($email, 'pass123'));
        $user = $repo->findByEmail($email);
        $approveHandler->handle(new ApproveUserCommand($user->id()->value()));
        $user = $repo->findByEmail($email);

        $issuer = new JwtTokenIssuer($settings['jwt']['secret']);
        $token  = $issuer->issue($user);

        return [$user, $token];
    }

    public function test_parse_returns_401_without_token(): void
    {
        $app = $this->createApp();
        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/recognition/parse')
            ->withHeader('Content-Type', 'application/json');

        $response = $app->handle($request);
        $this->assertSame(401, $response->getStatusCode());
    }

    public function test_parse_returns_games_with_approved_user(): void
    {
        $app = $this->createApp();
        [, $token] = $this->seedApprovedUser('recognition_test@test.com');

        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/recognition/parse')
            ->withHeader('Authorization', "Bearer $token")
            ->withHeader('Content-Type', 'application/json')
            ->withParsedBody(['text' => '1. e4 e5 2. Nf3 Nc6']);

        $response = $app->handle($request);
        $this->assertSame(200, $response->getStatusCode());

        $body = json_decode((string) $response->getBody(), true);
        $this->assertArrayHasKey('games', $body);
        $this->assertNotEmpty($body['games']);

        $game = $body['games'][0];
        $this->assertArrayHasKey('tree', $game);
        $this->assertArrayHasKey('mainline', $game['tree']);
        $this->assertNotEmpty($game['tree']['mainline']);
    }

    public function test_parse_returns_400_for_empty_text(): void
    {
        $app = $this->createApp();
        [, $token] = $this->seedApprovedUser('recognition_empty@test.com');

        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/recognition/parse')
            ->withHeader('Authorization', "Bearer $token")
            ->withHeader('Content-Type', 'application/json')
            ->withParsedBody(['text' => '']);

        $response = $app->handle($request);
        $this->assertSame(400, $response->getStatusCode());
    }

    public function test_parse_recognises_spanish_notation(): void
    {
        $app = $this->createApp();
        [, $token] = $this->seedApprovedUser('recognition_es@test.com');

        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/recognition/parse')
            ->withHeader('Authorization', "Bearer $token")
            ->withHeader('Content-Type', 'application/json')
            ->withParsedBody(['text' => '1. e4 e5 2. Cf3 Cc6']);

        $response = $app->handle($request);
        $this->assertSame(200, $response->getStatusCode());

        $body = json_decode((string) $response->getBody(), true);
        $game = $body['games'][0];
        $nodes = array_values($game['tree']['nodes']);
        $sans = array_map(fn($n) => $n['san'], $nodes);
        // Spanish Cf3/Cc6 normalised to Nf3/Nc6
        $this->assertContains('Nf3', $sans);
        $this->assertContains('Nc6', $sans);
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Application\Auth\ApproveUserHandler;
use App\Application\Auth\Command\ApproveUserCommand;
use App\Application\Auth\Command\RegisterUserCommand;
use App\Application\Auth\RegisterUserHandler;
use App\Application\Ingestion\Port\HtmlFetcher;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class WebparserControllerTest extends TestCase
{
    private const FIXTURE_HTML = <<<HTML
    <!DOCTYPE html>
    <html>
    <body>
    <article>
    <p>Opening: 1. e4 e5 2. Nf3 Nc6</p>
    <img src="diagram1.jpg" alt="position diagram">
    </article>
    </body>
    </html>
    HTML;

    private function seedApprovedUser(string $email = 'webparser@test.com'): array
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

    private function fakeFetcher(): HtmlFetcher
    {
        return new class(self::FIXTURE_HTML) implements HtmlFetcher {
            public function __construct(private string $html) {}
            public function fetch(string $url): string { return $this->html; }
        };
    }

    public function test_parse_returns_401_without_token(): void
    {
        $app = $this->createApp();
        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/webparser/parse')
            ->withHeader('Content-Type', 'application/json');

        $response = $app->handle($request);
        $this->assertSame(401, $response->getStatusCode());
    }

    public function test_parse_returns_400_for_invalid_url(): void
    {
        [, $token] = $this->seedApprovedUser('webparser_invalid@test.com');
        $app = $this->createAppWithOverrides([
            HtmlFetcher::class => fn() => $this->fakeFetcher(),
        ]);

        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/webparser/parse')
            ->withHeader('Authorization', "Bearer $token")
            ->withHeader('Content-Type', 'application/json')
            ->withParsedBody(['url' => 'not-a-url']);

        $response = $app->handle($request);
        $this->assertSame(400, $response->getStatusCode());
    }

    public function test_parse_returns_200_with_html_games_images(): void
    {
        [, $token] = $this->seedApprovedUser('webparser_ok@test.com');
        $app = $this->createAppWithOverrides([
            HtmlFetcher::class => fn() => $this->fakeFetcher(),
        ]);

        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/webparser/parse')
            ->withHeader('Authorization', "Bearer $token")
            ->withHeader('Content-Type', 'application/json')
            ->withParsedBody(['url' => 'http://example.com/chess-blog']);

        $response = $app->handle($request);
        $this->assertSame(200, $response->getStatusCode());

        $body = json_decode((string) $response->getBody(), true);

        $this->assertArrayHasKey('html', $body);
        $this->assertArrayHasKey('games', $body);
        $this->assertArrayHasKey('images', $body);

        $this->assertNotEmpty($body['html']);
        $this->assertNotEmpty($body['games']);

        $srcs = array_column($body['images'], 'src');
        $this->assertContains('diagram1.jpg', $srcs);
    }

    public function test_parse_games_have_gametree(): void
    {
        [, $token] = $this->seedApprovedUser('webparser_tree@test.com');
        $app = $this->createAppWithOverrides([
            HtmlFetcher::class => fn() => $this->fakeFetcher(),
        ]);

        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/api/webparser/parse')
            ->withHeader('Authorization', "Bearer $token")
            ->withHeader('Content-Type', 'application/json')
            ->withParsedBody(['url' => 'http://example.com/chess-blog']);

        $response = $app->handle($request);
        $body = json_decode((string) $response->getBody(), true);

        $game = $body['games'][0];
        $this->assertArrayHasKey('tree', $game);
        $this->assertArrayHasKey('mainline', $game['tree']);
        $this->assertNotEmpty($game['tree']['mainline']);
    }
}

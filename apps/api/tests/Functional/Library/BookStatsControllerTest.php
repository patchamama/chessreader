<?php

declare(strict_types=1);

namespace App\Tests\Functional\Library;

use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

class BookStatsControllerTest extends TestCase
{
    private string $tmpStorage;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tmpStorage = sys_get_temp_dir() . '/bookstats-test-' . uniqid('', true);
        mkdir($this->tmpStorage, 0777, true);
    }

    protected function tearDown(): void
    {
        $this->rrmdir($this->tmpStorage);
        parent::tearDown();
    }

    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $path = $dir . '/' . $entry;
            is_dir($path) ? $this->rrmdir($path) : @unlink($path);
        }
        @rmdir($dir);
    }

    /** @return array{0: \Slim\App, 1: \Psr\Container\ContainerInterface} */
    private function appWithTmpStorage(): array
    {
        $tmp = $this->tmpStorage;
        $container = $this->buildContainer([
            \App\Presentation\Library\BookStatsController::class => fn() =>
                new \App\Presentation\Library\BookStatsController($tmp),
        ]);
        $app    = \DI\Bridge\Slim\Bridge::create($container);
        $routes = require __DIR__ . '/../../../config/routes.php';
        $routes($app);

        return [$app, $container];
    }

    private function seedUser(
        \Psr\Container\ContainerInterface $container,
        string $email,
        Role $role,
    ): string {
        $repo   = $container->get(UserRepository::class);
        $hasher = $container->get(\App\Application\Auth\Port\PasswordHasher::class);

        $user = new User(
            new UserId(0),
            $email,
            $hasher->hash('pass123'),
            $role,
            RegistrationStatus::Approved,
            new \DateTimeImmutable(),
        );
        $saved = $repo->save($user);

        $settings = $container->get('settings');
        return (new JwtTokenIssuer($settings['jwt']['secret']))->issue($saved);
    }

    private function req(string $method, int $bookId, string $token, ?array $payload = null): \Psr\Http\Message\ServerRequestInterface
    {
        $req = (new ServerRequestFactory())
            ->createServerRequest($method, "/api/library/books/{$bookId}/stats")
            ->withHeader('Authorization', "Bearer {$token}")
            ->withHeader('Content-Type', 'application/json');
        if ($payload !== null) {
            $req->getBody()->write(json_encode($payload));
        }
        return $req;
    }

    private const STATS = ['games' => 12, 'plies' => 840, 'variations' => 77, 'comments' => 5, 'errors' => 3, 'analysedAt' => '2026-11-21T10:00:00.000Z', 'version' => '0.135.0'];

    public function testNoStatsYet(): void
    {
        [$app, $container] = $this->appWithTmpStorage();
        $token = $this->seedUser($container, 'st-none@test.com', Role::User);
        $resp = $app->handle($this->req('GET', 7, $token));
        $this->assertSame(200, $resp->getStatusCode());
        $this->assertNull(json_decode((string) $resp->getBody(), true)['stats']);
    }

    public function testSaveThenReadBack(): void
    {
        [$app, $container] = $this->appWithTmpStorage();
        $token = $this->seedUser($container, 'st-save@test.com', Role::User);
        $put = $app->handle($this->req('PUT', 7, $token, self::STATS));
        $this->assertSame(200, $put->getStatusCode());
        $got = json_decode((string) $app->handle($this->req('GET', 7, $token))->getBody(), true)['stats'];
        $this->assertSame(self::STATS, $got);
        $this->assertSame([], glob($this->tmpStorage . '/*.tmp'));
    }

    public function testRejectsInvalidCounts(): void
    {
        [$app, $container] = $this->appWithTmpStorage();
        $token = $this->seedUser($container, 'st-bad@test.com', Role::User);
        foreach ([['games' => -1], ['plies' => 'many'], ['errors' => 99999999999], ['comments' => 1.5]] as $patch) {
            $resp = $app->handle($this->req('PUT', 7, $token, array_merge(self::STATS, $patch)));
            $this->assertSame(400, $resp->getStatusCode(), json_encode($patch));
        }
        $missing = self::STATS;
        unset($missing['variations']);
        $this->assertSame(400, $app->handle($this->req('PUT', 7, $token, $missing))->getStatusCode());
        $this->assertSame([], glob($this->tmpStorage . '/book-stats*'));
    }

    public function testRequiresLogin(): void
    {
        [$app] = $this->appWithTmpStorage();
        $resp = $app->handle((new ServerRequestFactory())->createServerRequest('GET', '/api/library/books/7/stats'));
        $this->assertSame(401, $resp->getStatusCode());
    }
}

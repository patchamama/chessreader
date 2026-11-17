<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Application\Engine\Port\StockfishInstallation;
use App\Application\Engine\Port\StockfishReleases;
use App\Application\Engine\StockfishVersions;
use App\Application\Auth\Port\PasswordHasher;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use Psr\Container\ContainerInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

final class EngineControllerTest extends TestCase
{
    private function app(): array
    {
        $releases = new class implements StockfishReleases {
            public function releases(): array
            {
                return [['tag' => 'sf_19', 'name' => 'Stockfish 19', 'publishedAt' => '2026-09-05', 'prerelease' => false,
                    'assets' => [['name' => 'stockfish-macos-universal.tar.gz', 'url' => 'https://github.com/official-stockfish/x.tar.gz'], ['name' => 'stockfish-linux-x86-64-universal.tar.gz', 'url' => 'https://github.com/official-stockfish/y.tar.gz']]]];
            }
        };
        $installation = new class implements StockfishInstallation {
            public array $tags = [];
            public ?string $chosen = null;
            public function installed(): array { return $this->tags; }
            public function install(string $tag, string $url, string $assetName): void { $this->tags[] = $tag; }
            public function selected(): ?string { return $this->chosen; }
            public function select(?string $tag): void { $this->chosen = $tag; }
            public function binaryFor(string $tag): ?string { return in_array($tag, $this->tags, true) ? "/x/{$tag}" : null; }
        };
        $app = $this->createAppWithOverrides([
            StockfishVersions::class => fn() => new StockfishVersions($releases, $installation, '/usr/bin/stockfish', 'Linux', 'x86_64'),
        ]);
        return [$app, $this->token($app->getContainer(), Role::Admin, 'admin@test.com'), $this->token($app->getContainer(), Role::User, 'user@test.com')];
    }

    private function token(ContainerInterface $c, Role $role, string $email): string
    {
        $repo = $c->get(UserRepository::class);
        $repo->save(new User(new UserId(0), $email, $c->get(PasswordHasher::class)->hash('pw'), $role, RegistrationStatus::Approved, new \DateTimeImmutable()));
        return (new JwtTokenIssuer($c->get('settings')['jwt']['secret']))->issue($repo->findByEmail($email));
    }

    private function call($app, string $method, string $path, string $token, ?array $body = null)
    {
        $req = (new ServerRequestFactory())->createServerRequest($method, $path)->withHeader('Authorization', "Bearer {$token}");
        if ($body !== null) {
            $req = $req->withParsedBody($body);
        }
        return $app->handle($req);
    }

    public function test_admin_sees_the_latest_release_and_the_versions(): void
    {
        [$app, $admin] = $this->app();
        $res = $this->call($app, 'GET', '/api/admin/engine/stockfish', $admin);
        self::assertSame(200, $res->getStatusCode());
        $data = json_decode((string) $res->getBody(), true);
        self::assertSame('sf_19', $data['latest']['tag']);
        self::assertSame('system', $data['selected']);
        self::assertFalse($data['latestInstalled']);
    }

    public function test_admin_downloads_and_chooses_a_release(): void
    {
        [$app, $admin] = $this->app();
        $res = $this->call($app, 'POST', '/api/admin/engine/stockfish/install', $admin, ['tag' => 'sf_19']);
        self::assertSame(['sf_19'], json_decode((string) $res->getBody(), true)['installed']);
        $res = $this->call($app, 'PUT', '/api/admin/engine/stockfish/selected', $admin, ['tag' => 'sf_19']);
        self::assertSame('sf_19', json_decode((string) $res->getBody(), true)['selected']);
    }

    public function test_an_unknown_tag_is_refused(): void
    {
        [$app, $admin] = $this->app();
        self::assertSame(400, $this->call($app, 'POST', '/api/admin/engine/stockfish/install', $admin, ['tag' => '../../etc'])->getStatusCode());
    }

    public function test_only_admins(): void
    {
        [$app, , $user] = $this->app();
        self::assertSame(403, $this->call($app, 'GET', '/api/admin/engine/stockfish', $user)->getStatusCode());
    }
}

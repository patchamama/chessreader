<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Application\Auth\Port\PasswordHasher;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Presentation\Resources\ResourcesController;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class ResourcesControllerTest extends TestCase
{
    public function test_serves_a_resource_and_refuses_paths(): void
    {
        $dir = sys_get_temp_dir() . '/res-' . bin2hex(random_bytes(3));
        mkdir($dir);
        file_put_contents("{$dir}/traps.json", '[{"id":"t1"}]');
        $app = $this->createAppWithOverrides([ResourcesController::class => fn() => new ResourcesController($dir)]);
        $c = $app->getContainer();
        $repo = $c->get(UserRepository::class);
        $repo->save(new User(new UserId(0), 'r@test.com', $c->get(PasswordHasher::class)->hash('pw'), Role::User, RegistrationStatus::Approved, new \DateTimeImmutable()));
        $token = (new JwtTokenIssuer($c->get('settings')['jwt']['secret']))->issue($repo->findByEmail('r@test.com'));
        $get = fn(string $p) => $app->handle((new ServerRequestFactory())->createServerRequest('GET', $p)->withHeader('Authorization', "Bearer {$token}"));
        $ok = $get('/api/resources/traps');
        self::assertSame(200, $ok->getStatusCode());
        self::assertSame('[{"id":"t1"}]', (string) $ok->getBody());
        self::assertSame(404, $get('/api/resources/games')->getStatusCode());
        self::assertSame(400, $get('/api/resources/Bad_Name')->getStatusCode());
        unlink("{$dir}/traps.json");
        rmdir($dir);
    }
}

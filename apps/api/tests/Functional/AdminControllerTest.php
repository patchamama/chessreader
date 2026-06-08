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

class AdminControllerTest extends TestCase
{
    public function testPendingUsersWithoutTokenReturns401(): void
    {
        $app = $this->createApp();
        $factory = new ServerRequestFactory();
        $request = $factory->createServerRequest('GET', '/api/admin/pending-users');
        $response = $app->handle($request);
        $this->assertSame(401, $response->getStatusCode());
    }

    public function testPendingUsersWithUserTokenReturns403(): void
    {
        $app = $this->createApp();
        $container = $this->buildContainer();

        // Register a regular user and approve them so we can get a token
        $registerHandler = $container->get(RegisterUserHandler::class);
        $approveHandler  = $container->get(ApproveUserHandler::class);
        $repo            = $container->get(UserRepository::class);
        $settings        = $container->get('settings');

        $registerHandler->handle(new RegisterUserCommand('reguser@test.com', 'pass123'));
        $user = $repo->findByEmail('reguser@test.com');
        $approveHandler->handle(new ApproveUserCommand($user->id()->value()));
        $user = $repo->findByEmail('reguser@test.com');

        $issuer = new JwtTokenIssuer($settings['jwt']['secret']);
        $token  = $issuer->issue($user);

        $factory = new ServerRequestFactory();
        $request = $factory->createServerRequest('GET', '/api/admin/pending-users')
            ->withHeader('Authorization', "Bearer {$token}");

        $response = $app->handle($request);
        $this->assertSame(403, $response->getStatusCode());
    }

    public function testPendingUsersWithAdminTokenReturns200(): void
    {
        $app = $this->createApp();
        $container = $this->buildContainer();
        $settings  = $container->get('settings');
        $repo      = $container->get(UserRepository::class);

        // Seed an admin directly
        $adminUser = $this->seedAdmin($container);
        $issuer    = new JwtTokenIssuer($settings['jwt']['secret']);
        $token     = $issuer->issue($adminUser);

        $factory = new ServerRequestFactory();
        $request = $factory->createServerRequest('GET', '/api/admin/pending-users')
            ->withHeader('Authorization', "Bearer {$token}");

        $response = $app->handle($request);
        $this->assertSame(200, $response->getStatusCode());
    }

    public function testApproveUserFlipsStatus(): void
    {
        $app = $this->createApp();
        $container = $this->buildContainer();
        $settings  = $container->get('settings');
        $repo      = $container->get(UserRepository::class);
        $registerHandler = $container->get(RegisterUserHandler::class);

        $adminUser = $this->seedAdmin($container);
        $issuer    = new JwtTokenIssuer($settings['jwt']['secret']);
        $token     = $issuer->issue($adminUser);

        // Register a pending user
        $registerHandler->handle(new RegisterUserCommand('toApprove@test.com', 'pass123'));
        $pendingUser = $repo->findByEmail('toApprove@test.com');

        $factory = new ServerRequestFactory();
        $request = $factory->createServerRequest('POST', "/api/admin/users/{$pendingUser->id()->value()}/approve")
            ->withHeader('Authorization', "Bearer {$token}");

        $response = $app->handle($request);
        $this->assertSame(200, $response->getStatusCode());

        // Verify the user can now login
        $loginPayload = ['email' => 'toApprove@test.com', 'password' => 'pass123'];
        $loginRequest = $factory->createServerRequest('POST', '/api/auth/login')
            ->withHeader('Content-Type', 'application/json');
        $loginRequest->getBody()->write(json_encode($loginPayload));
        $loginResponse = $app->handle($loginRequest);
        $this->assertSame(200, $loginResponse->getStatusCode());
    }

    private function seedAdmin(\Psr\Container\ContainerInterface $container): \App\Domain\Auth\User
    {
        $repo = $container->get(UserRepository::class);
        $hasher = $container->get(\App\Application\Auth\Port\PasswordHasher::class);

        $admin = new \App\Domain\Auth\User(
            new \App\Domain\Auth\UserId(0),
            'admin@test.com',
            $hasher->hash('adminpass'),
            \App\Domain\Auth\Role::Admin,
            \App\Domain\Auth\RegistrationStatus::Approved,
            new \DateTimeImmutable(),
        );

        return $repo->save($admin);
    }
}

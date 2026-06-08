<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

class AuthControllerTest extends TestCase
{
    public function testRegisterReturns201(): void
    {
        $app = $this->createApp();
        $request = $this->jsonRequest('POST', '/api/auth/register', [
            'email'    => 'alice@test.com',
            'password' => 'secret123',
        ]);

        $response = $app->handle($request);
        $body = json_decode((string) $response->getBody(), true);

        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame('alice@test.com', $body['email']);
        $this->assertSame('pending', $body['status']);
        $this->assertArrayHasKey('id', $body);
    }

    public function testRegisterDuplicateReturns409(): void
    {
        $app = $this->createApp();
        $payload = ['email' => 'dup@test.com', 'password' => 'secret123'];

        $app->handle($this->jsonRequest('POST', '/api/auth/register', $payload));
        $response = $app->handle($this->jsonRequest('POST', '/api/auth/register', $payload));

        $this->assertSame(409, $response->getStatusCode());
    }

    public function testLoginWhilePendingReturns403(): void
    {
        $app = $this->createApp();
        $payload = ['email' => 'pending@test.com', 'password' => 'secret123'];
        $app->handle($this->jsonRequest('POST', '/api/auth/register', $payload));

        $response = $app->handle($this->jsonRequest('POST', '/api/auth/login', $payload));
        $this->assertSame(403, $response->getStatusCode());
    }

    public function testLoginAfterApprovalReturns200WithToken(): void
    {
        $app = $this->createApp();
        $payload = ['email' => 'approvaltest@test.com', 'password' => 'secret123'];
        $app->handle($this->jsonRequest('POST', '/api/auth/register', $payload));

        // Approve directly via handler
        $container = $this->buildContainer();
        $approveHandler = $container->get(\App\Application\Auth\ApproveUserHandler::class);
        $repo = $container->get(\App\Domain\Auth\UserRepository::class);
        $user = $repo->findByEmail('approvaltest@test.com');
        $approveHandler->handle(new \App\Application\Auth\Command\ApproveUserCommand($user->id()->value()));

        $response = $app->handle($this->jsonRequest('POST', '/api/auth/login', $payload));
        $body = json_decode((string) $response->getBody(), true);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertArrayHasKey('token', $body);
        $this->assertNotEmpty($body['token']);
    }

    private function jsonRequest(string $method, string $uri, array $data): \Psr\Http\Message\ServerRequestInterface
    {
        $factory = new ServerRequestFactory();
        $request = $factory->createServerRequest($method, $uri);
        $request = $request->withHeader('Content-Type', 'application/json');
        $request->getBody()->write(json_encode($data));
        return $request;
    }
}

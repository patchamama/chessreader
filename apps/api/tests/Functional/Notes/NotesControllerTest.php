<?php

declare(strict_types=1);

namespace App\Tests\Functional\Notes;

use App\Application\Auth\ApproveUserHandler;
use App\Application\Auth\Command\ApproveUserCommand;
use App\Application\Auth\Command\RegisterUserCommand;
use App\Application\Auth\RegisterUserHandler;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

class NotesControllerTest extends TestCase
{
    private string $tmpStorage;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tmpStorage = sys_get_temp_dir() . '/notes-test-' . uniqid('', true);
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

    /**
     * Build a container + app pair sharing one in-memory DB, whose
     * NotesController writes into an isolated temp storage dir.
     *
     * @return array{0: \Slim\App, 1: \Psr\Container\ContainerInterface}
     */
    private function appWithTmpStorage(): array
    {
        // buildContainer() forces its own 'settings', so override the controller
        // definition directly to point its storage dir at the temp folder.
        $tmp = $this->tmpStorage;
        $container = $this->buildContainer([
            \App\Presentation\Notes\NotesController::class => fn() =>
                new \App\Presentation\Notes\NotesController($tmp),
        ]);
        $app    = \DI\Bridge\Slim\Bridge::create($container);
        $routes = require __DIR__ . '/../../../config/routes.php';
        $routes($app);

        return [$app, $container];
    }

    private function seedApprovedUser(\Psr\Container\ContainerInterface $container, string $email): array
    {
        $registerHandler = $container->get(RegisterUserHandler::class);
        $approveHandler  = $container->get(ApproveUserHandler::class);
        $repo            = $container->get(UserRepository::class);
        $settings        = $container->get('settings');

        $registerHandler->handle(new RegisterUserCommand($email, 'pass123'));
        $user = $repo->findByEmail($email);
        $approveHandler->handle(new ApproveUserCommand($user->id()->value()));
        $user = $repo->findByEmail($email);

        $issuer = new JwtTokenIssuer($settings['jwt']['secret']);
        $token  = $issuer->issue($user);

        return [$user, $token];
    }

    private function getRequest(string $token): \Psr\Http\Message\ServerRequestInterface
    {
        return (new ServerRequestFactory())->createServerRequest('GET', '/api/notes')
            ->withHeader('Authorization', "Bearer {$token}");
    }

    private function putRequest(string $content, string $token): \Psr\Http\Message\ServerRequestInterface
    {
        $req = (new ServerRequestFactory())->createServerRequest('PUT', '/api/notes')
            ->withHeader('Authorization', "Bearer {$token}")
            ->withHeader('Content-Type', 'application/json');
        $req->getBody()->write(json_encode(['content' => $content]));
        return $req;
    }

    public function testGetReturnsEmptyContentWhenNoFile(): void
    {
        [$app, $container] = $this->appWithTmpStorage();
        [, $token] = $this->seedApprovedUser($container, 'notes-empty@test.com');

        $response = $app->handle($this->getRequest($token));

        $this->assertSame(200, $response->getStatusCode());
        $body = json_decode((string) $response->getBody(), true);
        $this->assertSame('', $body['content']);
    }

    public function testSaveThenGetReturnsContent(): void
    {
        [$app, $container] = $this->appWithTmpStorage();
        [, $token] = $this->seedApprovedUser($container, 'notes-save@test.com');

        $saveResp = $app->handle($this->putRequest("- [ ] study Sicilian\n- [x] done", $token));
        $this->assertSame(200, $saveResp->getStatusCode());
        $this->assertTrue(json_decode((string) $saveResp->getBody(), true)['ok']);

        $getResp = $app->handle($this->getRequest($token));
        $body = json_decode((string) $getResp->getBody(), true);
        $this->assertSame("- [ ] study Sicilian\n- [x] done", $body['content']);
    }

    public function testNotesAreIsolatedPerUser(): void
    {
        [$app, $container] = $this->appWithTmpStorage();
        [, $tokenA] = $this->seedApprovedUser($container, 'notes-a@test.com');
        [, $tokenB] = $this->seedApprovedUser($container, 'notes-b@test.com');

        $app->handle($this->putRequest('alice notes', $tokenA));
        $app->handle($this->putRequest('bob notes', $tokenB));

        $bodyA = json_decode((string) $app->handle($this->getRequest($tokenA))->getBody(), true);
        $bodyB = json_decode((string) $app->handle($this->getRequest($tokenB))->getBody(), true);

        $this->assertSame('alice notes', $bodyA['content']);
        $this->assertSame('bob notes', $bodyB['content']);
    }

    public function testSaveWritesNotesUserTxtFile(): void
    {
        [$app, $container] = $this->appWithTmpStorage();
        [$user, $token] = $this->seedApprovedUser($container, 'notes-file@test.com');

        $resp = $app->handle($this->putRequest('persisted', $token));
        $this->assertSame(200, $resp->getStatusCode(), (string) $resp->getBody());

        $file = $this->tmpStorage . '/notes/notes.' . $user->id()->value() . '.txt';
        $this->assertFileExists($file);
        $this->assertSame('persisted', file_get_contents($file));
    }
}

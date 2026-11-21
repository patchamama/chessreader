<?php

declare(strict_types=1);

namespace App\Tests\Functional\Library;

use App\Application\Auth\ApproveUserHandler;
use App\Application\Auth\Command\ApproveUserCommand;
use App\Application\Auth\Command\RegisterUserCommand;
use App\Application\Auth\RegisterUserHandler;
use App\Domain\Auth\UserRepository;
use App\Domain\Library\Book;
use App\Domain\Library\BookStatus;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Infrastructure\Persistence\DbalBookRepository;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class BookLanguageEndpointTest extends TestCase
{
    public function test_listing_and_update_carry_the_language(): void
    {
        $app = $this->createApp();
        $c   = $this->buildContainer();
        $c->get(RegisterUserHandler::class)->handle(new RegisterUserCommand('lang@test.com', 'pass123'));
        $user = $c->get(UserRepository::class)->findByEmail('lang@test.com');
        $c->get(ApproveUserHandler::class)->handle(new ApproveUserCommand($user->id()->value()));
        $user  = $c->get(UserRepository::class)->findByEmail('lang@test.com');
        $token = (new JwtTokenIssuer($c->get('settings')['jwt']['secret']))->issue($user);

        $repo = new DbalBookRepository($c->get(\Doctrine\DBAL\Connection::class));
        $id   = $repo->save(new Book(0, $user->id()->value(), 'B', 'A', BookStatus::Ready, '2024-01-01 00:00:00', '', 'en'));

        $list = $this->call($app, 'GET', '/api/library/books', $token);
        self::assertSame('en', json_decode((string) $list->getBody(), true)[0]['language']);

        $ok = $this->call($app, 'PUT', "/api/library/books/$id", $token, ['title' => 'B', 'author' => 'A', 'description' => '', 'language' => 'es']);
        self::assertSame(200, $ok->getStatusCode());
        self::assertSame('es', json_decode((string) $ok->getBody(), true)['language']);
        self::assertSame('es', $repo->findById($id)?->language);

        foreach (['english', 'E1', 'EN'] as $bad) {
            $res = $this->call($app, 'PUT', "/api/library/books/$id", $token, ['title' => 'B', 'author' => 'A', 'language' => $bad]);
            self::assertSame(422, $res->getStatusCode(), $bad);
        }
        self::assertSame('es', $repo->findById($id)?->language);

        $keep = $this->call($app, 'PUT', "/api/library/books/$id", $token, ['title' => 'B2', 'author' => 'A']);
        self::assertSame('es', json_decode((string) $keep->getBody(), true)['language']);

        $clear = $this->call($app, 'PUT', "/api/library/books/$id", $token, ['title' => 'B2', 'author' => 'A', 'language' => '']);
        self::assertSame('', json_decode((string) $clear->getBody(), true)['language']);
    }

    private function call(\Slim\App $app, string $method, string $path, string $token, ?array $body = null): \Psr\Http\Message\ResponseInterface
    {
        $req = (new ServerRequestFactory())->createServerRequest($method, $path)->withHeader('Authorization', "Bearer $token");
        if ($body !== null) {
            $req = $req->withHeader('Content-Type', 'application/json');
            $req->getBody()->write(json_encode($body));
            $req->getBody()->rewind();
        }
        return $app->handle($req);
    }
}

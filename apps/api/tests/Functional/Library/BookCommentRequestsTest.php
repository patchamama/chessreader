<?php

declare(strict_types=1);

namespace App\Tests\Functional\Library;

use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use App\Domain\Library\Book;
use App\Domain\Library\BookStatus;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Infrastructure\Persistence\DbalBookRepository;
use App\Tests\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ServerRequestFactory;

final class BookCommentRequestsTest extends TestCase
{
    private \Slim\App $app;
    private \Psr\Container\ContainerInterface $c;
    private string $userToken;
    private string $adminToken;
    private int $bookId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app = $this->createApp();
        $this->c   = $this->buildContainer();
        [$userId, $this->userToken] = $this->seedUser('req-user@test.com', Role::User);
        [, $this->adminToken]       = $this->seedUser('req-admin@test.com', Role::Admin);
        $repo         = new DbalBookRepository($this->c->get(\Doctrine\DBAL\Connection::class));
        $this->bookId = $repo->save(new Book(0, $userId, 'Req Book', 'A', BookStatus::Ready, '2024-01-01 00:00:00', '', 'en'));
    }

    public function test_create_returns_201_then_idempotent_200_with_same_id(): void
    {
        $first = $this->call('POST', "/api/library/books/{$this->bookId}/comment-request", $this->userToken, ['note' => 'please']);
        self::assertSame(201, $first->getStatusCode());
        $a = json_decode((string) $first->getBody(), true)['request'];
        self::assertSame('pending', $a['status']);
        self::assertSame('please', $a['note']);
        self::assertSame($this->bookId, $a['bookId']);

        $second = $this->call('POST', "/api/library/books/{$this->bookId}/comment-request", $this->userToken, []);
        self::assertSame(200, $second->getStatusCode());
        self::assertSame($a['id'], json_decode((string) $second->getBody(), true)['request']['id']);
    }

    public function test_unknown_book_is_404(): void
    {
        self::assertSame(404, $this->call('POST', '/api/library/books/9999/comment-request', $this->userToken, [])->getStatusCode());
    }

    public function test_note_over_500_chars_is_422(): void
    {
        $res = $this->call('POST', "/api/library/books/{$this->bookId}/comment-request", $this->userToken, ['note' => str_repeat('x', 501)]);
        self::assertSame(422, $res->getStatusCode());
    }

    public function test_requires_auth(): void
    {
        $req = (new ServerRequestFactory())->createServerRequest('POST', "/api/library/books/{$this->bookId}/comment-request");
        self::assertSame(401, $this->app->handle($req)->getStatusCode());
    }

    public function test_cancel_removes_pending_and_404_when_none(): void
    {
        self::assertSame(404, $this->call('DELETE', "/api/library/books/{$this->bookId}/comment-request", $this->userToken)->getStatusCode());
        $this->call('POST', "/api/library/books/{$this->bookId}/comment-request", $this->userToken, []);
        self::assertSame(200, $this->call('DELETE', "/api/library/books/{$this->bookId}/comment-request", $this->userToken)->getStatusCode());
        $list = json_decode((string) $this->call('GET', '/api/library/comment-requests', $this->userToken)->getBody(), true);
        self::assertSame([], $list['requests']);
        // can request again after cancelling
        self::assertSame(201, $this->call('POST', "/api/library/books/{$this->bookId}/comment-request", $this->userToken, [])->getStatusCode());
    }

    public function test_cancel_by_another_user_is_forbidden_but_admin_may(): void
    {
        $this->call('POST', "/api/library/books/{$this->bookId}/comment-request", $this->userToken, []);
        [, $other] = $this->seedUser('other@test.com', Role::User);
        self::assertSame(403, $this->call('DELETE', "/api/library/books/{$this->bookId}/comment-request", $other)->getStatusCode());
        self::assertSame(200, $this->call('DELETE', "/api/library/books/{$this->bookId}/comment-request", $this->adminToken)->getStatusCode());
    }

    public function test_patch_is_admin_only_and_changes_status(): void
    {
        $id = json_decode((string) $this->call('POST', "/api/library/books/{$this->bookId}/comment-request", $this->userToken, [])->getBody(), true)['request']['id'];

        self::assertSame(403, $this->call('PATCH', "/api/library/comment-requests/$id", $this->userToken, ['status' => 'done'])->getStatusCode());
        self::assertSame(422, $this->call('PATCH', "/api/library/comment-requests/$id", $this->adminToken, ['status' => 'bogus'])->getStatusCode());
        self::assertSame(404, $this->call('PATCH', '/api/library/comment-requests/9999', $this->adminToken, ['status' => 'done'])->getStatusCode());

        $ok = $this->call('PATCH', "/api/library/comment-requests/$id", $this->adminToken, ['status' => 'done']);
        self::assertSame(200, $ok->getStatusCode());
        self::assertSame('done', json_decode((string) $ok->getBody(), true)['request']['status']);
    }

    public function test_list_by_status_with_book_title_and_default_pending(): void
    {
        $id = json_decode((string) $this->call('POST', "/api/library/books/{$this->bookId}/comment-request", $this->userToken, [])->getBody(), true)['request']['id'];

        $pending = json_decode((string) $this->call('GET', '/api/library/comment-requests', $this->userToken)->getBody(), true)['requests'];
        self::assertCount(1, $pending);
        self::assertSame('Req Book', $pending[0]['bookTitle']);
        self::assertSame('en', $pending[0]['language']);
        self::assertSame($this->bookId, $pending[0]['bookId']);
        self::assertArrayHasKey('createdAt', $pending[0]);
        self::assertArrayHasKey('requestedBy', $pending[0]);

        $this->call('PATCH', "/api/library/comment-requests/$id", $this->adminToken, ['status' => 'done']);
        self::assertSame([], json_decode((string) $this->call('GET', '/api/library/comment-requests?status=pending', $this->userToken)->getBody(), true)['requests']);
        self::assertCount(1, json_decode((string) $this->call('GET', '/api/library/comment-requests?status=done', $this->userToken)->getBody(), true)['requests']);
        self::assertSame(422, $this->call('GET', '/api/library/comment-requests?status=nope', $this->userToken)->getStatusCode());
    }

    public function test_books_listing_carries_latest_comment_request(): void
    {
        $get = fn () => json_decode((string) $this->call('GET', '/api/library/books', $this->userToken)->getBody(), true)[0]['commentRequest'];
        self::assertNull($get());
        $id = json_decode((string) $this->call('POST', "/api/library/books/{$this->bookId}/comment-request", $this->userToken, [])->getBody(), true)['request']['id'];
        self::assertSame('pending', $get());
        $this->call('PATCH', "/api/library/comment-requests/$id", $this->adminToken, ['status' => 'rejected']);
        self::assertSame('rejected', $get());
    }

    /** @return array{0:int,1:string} */
    private function seedUser(string $email, Role $role): array
    {
        $repo  = $this->c->get(UserRepository::class);
        $hash  = $this->c->get(\App\Application\Auth\Port\PasswordHasher::class)->hash('pass123');
        $saved = $repo->save(new User(new UserId(0), $email, $hash, $role, RegistrationStatus::Approved, new \DateTimeImmutable()));
        return [$saved->id()->value(), (new JwtTokenIssuer($this->c->get('settings')['jwt']['secret']))->issue($saved)];
    }

    private function call(string $method, string $path, string $token, ?array $body = null): ResponseInterface
    {
        $req = (new ServerRequestFactory())->createServerRequest($method, $path)->withHeader('Authorization', "Bearer $token");
        if ($body !== null) {
            $req = $req->withHeader('Content-Type', 'application/json');
            $req->getBody()->write(json_encode($body));
            $req->getBody()->rewind();
        }
        return $this->app->handle($req);
    }
}

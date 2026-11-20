<?php

declare(strict_types=1);

namespace App\Tests\Unit\Presentation\Comments;

use App\Infrastructure\Comments\SqlitePositionCommentStore;
use App\Presentation\Comments\CommentsController;
use App\Tests\Unit\Infrastructure\Comments\SqlitePositionCommentStoreTest;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

final class CommentsControllerTest extends TestCase
{
    private CommentsController $controller;

    protected function setUp(): void
    {
        $this->controller = new CommentsController(new SqlitePositionCommentStore('', SqlitePositionCommentStoreTest::database()));
    }

    /** @return array{int, array<string, mixed>} */
    private function call(string $action, string $uri): array
    {
        parse_str((string) parse_url($uri, PHP_URL_QUERY), $query);
        $request = (new ServerRequestFactory())->createServerRequest('GET', $uri)->withQueryParams($query);
        /** @var ResponseInterface $res */
        $res = $this->controller->{$action}($request, (new ResponseFactory())->createResponse());
        return [$res->getStatusCode(), json_decode((string) $res->getBody(), true)];
    }

    public function test_list_returns_a_page_and_the_total(): void
    {
        [$status, $body] = $this->call('list', '/api/comments?offset=0&limit=2');
        self::assertSame(200, $status);
        self::assertSame(3, $body['total']);
        self::assertSame(0, $body['offset']);
        self::assertSame(2, $body['limit']);
        self::assertSame([1, 2], array_column($body['comments'], 'id'));
    }

    public function test_list_passes_the_filters(): void
    {
        [, $body] = $this->call('list', '/api/comments?q=caballo&kind=book&lang=es&source=1');
        self::assertSame([1], array_column($body['comments'], 'id'));
        [, $none] = $this->call('list', '/api/comments?source=9');
        self::assertSame(0, $none['total']);
    }

    public function test_list_bounds_the_limit_to_200(): void
    {
        [, $body] = $this->call('list', '/api/comments?limit=9999&offset=-3');
        self::assertSame(200, $body['limit']);
        self::assertSame(0, $body['offset']);
    }

    public function test_list_rejects_an_unknown_kind_or_a_bad_language(): void
    {
        self::assertSame(400, $this->call('list', '/api/comments?kind=other')[0]);
        self::assertSame(400, $this->call('list', '/api/comments?lang=es;drop')[0]);
    }

    public function test_sources(): void
    {
        [$status, $body] = $this->call('sources', '/api/comments/sources');
        self::assertSame(200, $status);
        self::assertSame(['Invented Book', 'Lichess studies'], array_column($body['sources'], 'title'));
    }
}

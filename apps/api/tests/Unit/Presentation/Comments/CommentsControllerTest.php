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

    private function mutate(string $action, string $method, int $id): ResponseInterface
    {
        return $this->controller->{$action}((new ServerRequestFactory())->createServerRequest($method, "/api/comments/{$id}"), (new ResponseFactory())->createResponse(), $id);
    }

    public function test_delete_hides_the_comment_and_restore_shows_it_again(): void
    {
        $res = $this->mutate('delete', 'DELETE', 2);
        self::assertSame(200, $res->getStatusCode());
        self::assertSame(['hidden' => 2], json_decode((string) $res->getBody(), true));
        [, $body] = $this->call('list', '/api/comments');
        self::assertSame([1, 3], array_column($body['comments'], 'id'));
        [, $hidden] = $this->call('list', '/api/comments?hidden=1');
        self::assertSame([2], array_column($hidden['comments'], 'id'));

        $res = $this->mutate('restore', 'POST', 2);
        self::assertSame(['restored' => 2], json_decode((string) $res->getBody(), true));
        [, $body] = $this->call('list', '/api/comments');
        self::assertSame([1, 2, 3], array_column($body['comments'], 'id'));
    }

    public function test_hide_and_restore_of_an_unknown_comment_are_404(): void
    {
        self::assertSame(404, $this->mutate('delete', 'DELETE', 99)->getStatusCode());
        self::assertSame(404, $this->mutate('restore', 'POST', 99)->getStatusCode());
    }

    private function translate(int $id, string $lang, mixed $body): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('PUT', "/api/comments/{$id}/translations/{$lang}")->withParsedBody($body);
        return $this->controller->setTranslation($request, (new ResponseFactory())->createResponse(), $id, $lang);
    }

    public function test_set_translation_saves_the_text_and_shows_it_in_the_list(): void
    {
        $res = $this->translate(2, 'es', ['text' => '  Clavar el caballo.  ']);
        self::assertSame(200, $res->getStatusCode());
        self::assertSame(['saved' => 2, 'lang' => 'es'], json_decode((string) $res->getBody(), true));
        [, $body] = $this->call('list', '/api/comments');
        $row = array_values(array_filter($body['comments'], fn ($c) => $c['id'] === 2))[0];
        self::assertSame('Clavar el caballo.', $row['translations']['es']);
    }

    public function test_set_translation_rejects_a_bad_language_or_text_and_unknown_comments(): void
    {
        self::assertSame(400, $this->translate(2, 'e', ['text' => 'x'])->getStatusCode());
        self::assertSame(400, $this->translate(2, 'es', ['text' => '   '])->getStatusCode());
        self::assertSame(400, $this->translate(2, 'es', ['text' => str_repeat('x', 20001)])->getStatusCode());
        self::assertSame(400, $this->translate(2, 'es', null)->getStatusCode());
        self::assertSame(404, $this->translate(99, 'es', ['text' => 'x'])->getStatusCode());
    }

    public function test_top_returns_the_ranking_and_caps_the_limit(): void
    {
        [$status, $body] = $this->call('top', '/api/comments/top?limit=500&kind=lichess');
        self::assertSame(200, $status);
        self::assertSame(1, $body['positions'][0]['rank']);
        self::assertSame(1, $body['positions'][0]['count']);
        self::assertSame(2, $body['positions'][1]['rank']);
        self::assertSame(['id', 'title', 'author', 'book', 'kind', 'lang', 'count'], array_keys($body['positions'][0]['sources'][0]));
        self::assertSame(['id', 'ply', 'move', 'san', 'text'], array_keys($body['positions'][0]['samples'][0]));
        self::assertArrayNotHasKey('hash', $body['positions'][0]);
        [$bad] = $this->call('top', '/api/comments/top?kind=zzz');
        self::assertSame(400, $bad);
    }

    private function putGameTranslation(string $id, string $lang, mixed $body): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('PUT', "/api/comments/games/{$id}/translations/{$lang}")->withParsedBody($body);
        return $this->controller->setGameTranslation($request, (new ResponseFactory())->createResponse(), $id, $lang);
    }

    public function test_game_translations_are_an_object_even_when_empty(): void
    {
        $res = $this->controller->game((new ServerRequestFactory())->createServerRequest('GET', '/x'), (new ResponseFactory())->createResponse(), '1-1');
        $raw = (string) $res->getBody();
        self::assertStringContainsString('"translations":{}', $raw);
        self::assertSame('1. e4 e5 *', json_decode($raw, true)['pgn']);
    }

    public function test_set_game_translation_saves_and_shows_it_in_the_game(): void
    {
        $res = $this->putGameTranslation('1-1', 'es', ['pgn' => '  1. e4 e5 {es} *  ']);
        self::assertSame(200, $res->getStatusCode());
        self::assertSame(['saved' => '1-1', 'lang' => 'es'], json_decode((string) $res->getBody(), true));
        $game = $this->controller->game((new ServerRequestFactory())->createServerRequest('GET', '/x'), (new ResponseFactory())->createResponse(), '1-1');
        self::assertSame(['es' => '1. e4 e5 {es} *'], json_decode((string) $game->getBody(), true)['translations']);
    }

    public function test_set_game_translation_rejects_bad_input_and_unknown_games(): void
    {
        self::assertSame(400, $this->putGameTranslation('1-1', 'e', ['pgn' => 'x'])->getStatusCode());
        self::assertSame(400, $this->putGameTranslation('1-1', 'es', ['pgn' => '  '])->getStatusCode());
        self::assertSame(400, $this->putGameTranslation('1-1', 'es', ['pgn' => str_repeat('x', 400001)])->getStatusCode());
        self::assertSame(400, $this->putGameTranslation('1-1', 'es', null)->getStatusCode());
        self::assertSame(404, $this->putGameTranslation('nope', 'es', ['pgn' => 'x'])->getStatusCode());
    }

    /** @return array<string, mixed> */
    private static function validBookGame(): array
    {
        return [
            'book' => ['title' => 'Controller Book', 'lang' => 'en'],
            'chapter' => 1,
            'game' => [
                'pgn' => '1. e4 e5 *',
                'comments' => [['hash' => 'aaaaaaaaaaaaaaaa', 'key' => 'k', 'ply' => 1, 'move' => 1, 'san' => 'e4', 'text' => 'Hello.']],
                'translations' => ['es' => ['pgn' => '1. e4 e5 {es} *', 'comments' => ['Hola.']]],
            ],
        ];
    }

    private function postBookGame(mixed $body): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/comments/book-games')->withParsedBody($body);
        return $this->controller->addBookGame($request, (new ResponseFactory())->createResponse());
    }

    public function test_add_book_game_ingests_and_reports_ids_and_counts(): void
    {
        $res = $this->postBookGame(self::validBookGame());
        self::assertSame(200, $res->getStatusCode());
        $body = json_decode((string) $res->getBody(), true);
        self::assertMatchesRegularExpression('/^b[0-9a-f]{12}$/', $body['gameId']);
        self::assertSame(1, $body['added']);
        self::assertSame(1, $body['translated']);
        self::assertIsInt($body['sourceId']);
    }

    /** @return iterable<string, array{callable(array<string, mixed>): array<string, mixed>}> */
    public static function invalidBookGames(): iterable
    {
        yield 'no body' => [fn(array $b) => []];
        yield 'empty title' => [function (array $b) { $b['book']['title'] = ''; return $b; }];
        yield 'long title' => [function (array $b) { $b['book']['title'] = str_repeat('t', 301); return $b; }];
        yield 'bad book lang' => [function (array $b) { $b['book']['lang'] = 'E'; return $b; }];
        yield 'bad chapter' => [function (array $b) { $b['chapter'] = 'one'; return $b; }];
        yield 'negative chapter' => [function (array $b) { $b['chapter'] = -1; return $b; }];
        yield 'empty pgn' => [function (array $b) { $b['game']['pgn'] = ''; return $b; }];
        yield 'long pgn' => [function (array $b) { $b['game']['pgn'] = str_repeat('x', 400001); return $b; }];
        yield 'bad hash' => [function (array $b) { $b['game']['comments'][0]['hash'] = 'ABCDEF0123456789'; return $b; }];
        yield 'short hash' => [function (array $b) { $b['game']['comments'][0]['hash'] = 'abc'; return $b; }];
        yield 'empty text' => [function (array $b) { $b['game']['comments'][0]['text'] = ''; return $b; }];
        yield 'long text' => [function (array $b) { $b['game']['comments'][0]['text'] = str_repeat('x', 20001); return $b; }];
        yield 'no san' => [function (array $b) { unset($b['game']['comments'][0]['san']); return $b; }];
        yield 'too many comments' => [function (array $b) { $b['game']['comments'] = array_fill(0, 501, $b['game']['comments'][0]); return $b; }];
        yield 'bad translation lang' => [function (array $b) { $b['game']['translations'] = ['Spanish' => ['pgn' => 'x']]; return $b; }];
        yield 'translation count mismatch' => [function (array $b) { $b['game']['translations']['es']['comments'] = ['a', 'b']; return $b; }];
        yield 'long translated comment' => [function (array $b) { $b['game']['translations']['es']['comments'] = [str_repeat('x', 20001)]; return $b; }];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('invalidBookGames')]
    public function test_add_book_game_rejects_invalid_input_and_writes_nothing(callable $break): void
    {
        self::assertSame(400, $this->postBookGame($break(self::validBookGame()))->getStatusCode());
        [, $list] = $this->call('list', '/api/comments?limit=200');
        self::assertSame(3, $list['total']);
    }

    public function test_add_book_game_accepts_500_comments(): void
    {
        $b = self::validBookGame();
        $b['game']['comments'] = [];
        for ($i = 0; $i < 500; $i++) {
            $b['game']['comments'][] = ['hash' => 'aaaaaaaaaaaaaaaa', 'key' => 'k', 'ply' => 1, 'move' => 1, 'san' => 'e4', 'text' => "c{$i}"];
        }
        unset($b['game']['translations']);
        self::assertSame(200, $this->postBookGame($b)->getStatusCode());
    }
}

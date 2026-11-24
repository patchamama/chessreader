<?php

declare(strict_types=1);

namespace App\Tests\Functional\GeneratedPgn;

use App\Application\Auth\Port\PasswordHasher;
use App\Application\GeneratedPgn\LichessStudyImporter;
use App\Application\Studies\LichessStudyException;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class GeneratedPgnControllerTest extends TestCase
{
    /** @var list<array{string, string, string}> */
    public array $uploads = [];
    public ?LichessStudyException $uploadFails = null;

    /** @return array{0: App, 1: string, 2: string, 3: string} app, user, other user, admin tokens */
    private function app(): array
    {
        $self = $this;
        $importer = new class ($self) implements LichessStudyImporter {
            public function __construct(private readonly GeneratedPgnControllerTest $t)
            {
            }

            public function importPgn(string $studyId, string $pgn, string $token): array
            {
                if ($this->t->uploadFails !== null) {
                    throw $this->t->uploadFails;
                }
                $this->t->uploads[] = [$studyId, $pgn, $token];
                return [['id' => 'ch000001', 'name' => 'Game']];
            }
        };
        $app = $this->createAppWithOverrides([LichessStudyImporter::class => fn () => $importer]);
        $c = $app->getContainer();
        $repo = $c->get(UserRepository::class);
        $hash = $c->get(PasswordHasher::class)->hash('pw');
        foreach ([['u@test.com', Role::User], ['v@test.com', Role::User], ['a@test.com', Role::Admin]] as [$mail, $role]) {
            $repo->save(new User(new UserId(0), $mail, $hash, $role, RegistrationStatus::Approved, new \DateTimeImmutable()));
        }
        $issuer = new JwtTokenIssuer($c->get('settings')['jwt']['secret']);
        return [$app, $issuer->issue($repo->findByEmail('u@test.com')), $issuer->issue($repo->findByEmail('v@test.com')), $issuer->issue($repo->findByEmail('a@test.com'))];
    }

    private function call(App $app, string $method, string $path, ?string $token, ?array $body = null): ResponseInterface
    {
        $req = (new ServerRequestFactory())->createServerRequest($method, $path);
        if ($token !== null) {
            $req = $req->withHeader('Authorization', "Bearer {$token}");
        }
        if ($body !== null) {
            $req = $req->withHeader('Content-Type', 'application/json');
            $req->getBody()->write((string) json_encode($body));
            $req->getBody()->rewind();
        }
        return $app->handle($req);
    }

    private function json(ResponseInterface $r): array
    {
        return json_decode((string) $r->getBody(), true);
    }

    private static function game(int $index, array $over = []): array
    {
        return $over + ['bookId' => 7, 'bookTitle' => 'Invented Endings', 'chapter' => 2, 'gameIndex' => $index,
            'white' => 'Alpha', 'black' => 'Beta', 'event' => 'Test Open', 'result' => '1-0',
            'pgn' => "[White \"Alpha\"]\n[Black \"Beta\"]\n[Result \"1-0\"]\n\n1. e4 {Invented comment.} e5 1-0\n"];
    }

    public function test_auth_is_required_on_every_route(): void
    {
        [$app] = $this->app();
        foreach ([['GET', '/api/generated-pgn'], ['GET', '/api/generated-pgn/1'], ['POST', '/api/generated-pgn'], ['PUT', '/api/generated-pgn/1'],
            ['DELETE', '/api/generated-pgn/1'], ['POST', '/api/generated-pgn/1/lichess']] as [$m, $p]) {
            self::assertSame(401, $this->call($app, $m, $p, null)->getStatusCode(), "$m $p");
        }
    }

    public function test_create_list_get_filter_update_and_delete(): void
    {
        [$app, $user, $other, $admin] = $this->app();
        $res = $this->call($app, 'POST', '/api/generated-pgn', $user, ['games' => [self::game(0), self::game(1, ['white' => 'Gamma']), self::game(0, ['bookId' => 9, 'bookTitle' => 'Other Book'])]]);
        self::assertSame(200, $res->getStatusCode());
        $r = $this->json($res);
        self::assertSame(3, $r['created']);
        self::assertSame(0, $r['updated']);

        $list = $this->json($this->call($app, 'GET', '/api/generated-pgn', $other));
        self::assertCount(3, $list['items']);
        self::assertArrayNotHasKey('pgn', $list['items'][0]);
        self::assertSame('new', $list['items'][0]['status']);
        self::assertEqualsCanonicalizing([['bookId' => 7, 'bookTitle' => 'Invented Endings', 'count' => 2], ['bookId' => 9, 'bookTitle' => 'Other Book', 'count' => 1]], $list['books']);

        self::assertCount(2, $this->json($this->call($app, 'GET', '/api/generated-pgn?book_id=7', $user))['items']);
        self::assertCount(1, $this->json($this->call($app, 'GET', '/api/generated-pgn?q=gamma', $user))['items']);
        self::assertSame(0, count($this->json($this->call($app, 'GET', '/api/generated-pgn?status=reviewed', $user))['items']));
        self::assertSame(400, $this->call($app, 'GET', '/api/generated-pgn?status=zzz', $user)->getStatusCode());

        $id = $list['items'][0]['id'];
        $get = $this->json($this->call($app, 'GET', "/api/generated-pgn/{$id}", $other));
        self::assertStringContainsString('{Invented comment.}', $get['item']['pgn']);
        // the reader learns whether it may change a game: the author and an admin can, others cannot
        self::assertFalse($get['item']['canWrite']);
        self::assertFalse($list['items'][0]['canWrite']);
        self::assertTrue($this->json($this->call($app, 'GET', "/api/generated-pgn/{$id}", $user))['item']['canWrite']);
        self::assertTrue($this->json($this->call($app, 'GET', "/api/generated-pgn/{$id}", $admin))['item']['canWrite']);
        self::assertSame(404, $this->call($app, 'GET', '/api/generated-pgn/9999', $user)->getStatusCode());

        // a stranger cannot write; the owner and an admin can
        self::assertSame(403, $this->call($app, 'PUT', "/api/generated-pgn/{$id}", $other, ['status' => 'reviewed'])->getStatusCode());
        self::assertSame(403, $this->call($app, 'DELETE', "/api/generated-pgn/{$id}", $other)->getStatusCode());
        $put = $this->call($app, 'PUT', "/api/generated-pgn/{$id}", $user, ['status' => 'reviewed', 'white' => 'Delta', 'pgn' => "1. d4 d5 *\n"]);
        self::assertSame(200, $put->getStatusCode());
        $item = $this->json($put)['item'];
        self::assertSame('reviewed', $item['status']);
        self::assertSame('Delta', $item['white']);
        self::assertSame("1. d4 d5 *\n", $item['pgn']);
        self::assertSame(200, $this->call($app, 'PUT', "/api/generated-pgn/{$id}", $admin, ['status' => 'rejected'])->getStatusCode());
        self::assertSame(422, $this->call($app, 'PUT', "/api/generated-pgn/{$id}", $user, ['status' => 'bogus'])->getStatusCode());
        self::assertSame(422, $this->call($app, 'PUT', "/api/generated-pgn/{$id}", $user, ['pgn' => ''])->getStatusCode());
        self::assertSame(404, $this->call($app, 'PUT', '/api/generated-pgn/9999', $user, ['status' => 'new'])->getStatusCode());

        self::assertSame(200, $this->call($app, 'DELETE', "/api/generated-pgn/{$id}", $admin)->getStatusCode());
        self::assertSame(404, $this->call($app, 'DELETE', "/api/generated-pgn/{$id}", $admin)->getStatusCode());
        self::assertCount(2, $this->json($this->call($app, 'GET', '/api/generated-pgn', $user))['items']);
    }

    public function test_generating_again_updates_new_games_and_keeps_reviewed_ones(): void
    {
        [$app, $user] = $this->app();
        $this->call($app, 'POST', '/api/generated-pgn', $user, ['games' => [self::game(0), self::game(1)]]);
        $items = $this->json($this->call($app, 'GET', '/api/generated-pgn', $user))['items'];
        $reviewed = null;
        foreach ($items as $i) {
            if ($i['gameIndex'] === 1) {
                $reviewed = $i['id'];
            }
        }
        $this->call($app, 'PUT', "/api/generated-pgn/{$reviewed}", $user, ['status' => 'reviewed']);

        $r = $this->json($this->call($app, 'POST', '/api/generated-pgn', $user, ['games' => [self::game(0, ['pgn' => "1. c4 *\n"]), self::game(1, ['pgn' => "1. c4 *\n"]), self::game(2)]]));
        self::assertSame(['created' => 1, 'updated' => 1, 'skipped' => 1], ['created' => $r['created'], 'updated' => $r['updated'], 'skipped' => $r['skipped']]);
        self::assertCount(3, $this->json($this->call($app, 'GET', '/api/generated-pgn', $user))['items']);
        self::assertStringNotContainsString('c4', $this->json($this->call($app, 'GET', "/api/generated-pgn/{$reviewed}", $user))['item']['pgn']);
    }

    public function test_create_validation_and_size_caps(): void
    {
        [$app, $user] = $this->app();
        $post = fn (array $b) => $this->call($app, 'POST', '/api/generated-pgn', $user, $b)->getStatusCode();
        self::assertSame(422, $post(['games' => []]));
        self::assertSame(422, $post(['nope' => 1]));
        self::assertSame(422, $post(['games' => [self::game(0, ['pgn' => ''])]]));
        self::assertSame(422, $post(['games' => [self::game(0, ['bookId' => 0])]]));
        self::assertSame(422, $post(['games' => [self::game(0, ['result' => 'win'])]]));
        self::assertSame(422, $post(['games' => [self::game(0, ['pgn' => str_repeat('x', 200_001)])]]));
        self::assertSame(422, $post(['games' => array_map(fn (int $i): array => self::game($i), range(0, 200))]));
        self::assertSame(400, $this->call($app, 'POST', '/api/generated-pgn', $user)->getStatusCode());
        self::assertSame([], $this->json($this->call($app, 'GET', '/api/generated-pgn', $user))['items']);
    }

    public function test_upload_to_an_existing_study_with_a_per_request_token(): void
    {
        [$app, $user, $other] = $this->app();
        $this->call($app, 'POST', '/api/generated-pgn', $user, ['games' => [self::game(0)]]);
        $id = $this->json($this->call($app, 'GET', '/api/generated-pgn', $user))['items'][0]['id'];
        $token = str_repeat('a', 24);

        $res = $this->call($app, 'POST', "/api/generated-pgn/{$id}/lichess", $user, ['studyId' => 'https://lichess.org/study/AbCdEfGh/xyz', 'visibility' => 'private', 'token' => $token]);
        self::assertSame(200, $res->getStatusCode());
        $r = $this->json($res);
        self::assertSame('https://lichess.org/study/AbCdEfGh', $r['url']);
        self::assertFalse($r['visibilityApplied']);
        self::assertSame('private', $r['visibility']);
        self::assertNotSame('', $r['note']);
        self::assertSame('AbCdEfGh', $this->uploads[0][0]);
        self::assertStringContainsString('1. e4', $this->uploads[0][1]);
        self::assertSame($token, $this->uploads[0][2]);
        // the token is not in the response and not stored
        self::assertStringNotContainsString($token, json_encode($r));
        self::assertSame('https://lichess.org/study/AbCdEfGh', $this->json($this->call($app, 'GET', "/api/generated-pgn/{$id}", $user))['item']['lichessUrl']);
        self::assertStringNotContainsString($token, json_encode($this->json($this->call($app, 'GET', "/api/generated-pgn/{$id}", $user))));

        self::assertSame(403, $this->call($app, 'POST', "/api/generated-pgn/{$id}/lichess", $other, ['studyId' => 'AbCdEfGh', 'visibility' => 'public', 'token' => $token])->getStatusCode());
    }

    public function test_upload_validation_and_lichess_errors(): void
    {
        [$app, $user] = $this->app();
        $this->call($app, 'POST', '/api/generated-pgn', $user, ['games' => [self::game(0)]]);
        $id = $this->json($this->call($app, 'GET', '/api/generated-pgn', $user))['items'][0]['id'];
        $token = str_repeat('b', 24);
        $up = fn (array $b) => $this->call($app, 'POST', "/api/generated-pgn/{$id}/lichess", $user, $b);
        self::assertSame(422, $up(['studyId' => 'short', 'visibility' => 'private', 'token' => $token])->getStatusCode());
        self::assertSame(422, $up(['studyId' => 'AbCdEfGh', 'visibility' => 'secret', 'token' => $token])->getStatusCode());
        self::assertSame(422, $up(['studyId' => 'AbCdEfGh', 'visibility' => 'private', 'token' => 'bad token!'])->getStatusCode());
        self::assertSame(422, $up(['studyId' => 'AbCdEfGh', 'visibility' => 'private'])->getStatusCode());
        self::assertSame(404, $this->call($app, 'POST', '/api/generated-pgn/9999/lichess', $user, ['studyId' => 'AbCdEfGh', 'visibility' => 'private', 'token' => $token])->getStatusCode());
        self::assertSame([], $this->uploads);

        $this->uploadFails = new LichessStudyException(403, 'Lichess refused the token');
        $err = $up(['studyId' => 'AbCdEfGh', 'visibility' => 'private', 'token' => $token]);
        self::assertSame(502, $err->getStatusCode());
        self::assertStringNotContainsString($token, (string) $err->getBody());
        self::assertNull($this->json($this->call($app, 'GET', "/api/generated-pgn/{$id}", $user))['item']['lichessUrl']);
    }
}

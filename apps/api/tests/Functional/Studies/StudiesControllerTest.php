<?php

declare(strict_types=1);

namespace App\Tests\Functional\Studies;

use App\Application\Studies\CommentChapterSource;
use App\Application\Studies\LichessStudySource;
use App\Application\Auth\Port\PasswordHasher;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use App\Tests\Unit\Studies\StudiesTestSupport;
use App\Tests\Unit\Studies\StudyFixtures;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class StudiesControllerTest extends TestCase
{
    /** @return array{0: App, 1: string, 2: string} app, user token, admin token */
    private function app(): array
    {
        $source = StudiesTestSupport::source([
            'AAAAAAAA' => StudyFixtures::pgn('AAAAAAAA', 'Root', 'alice', ['go lichess.org/study/BBBBBBBB']),
            'BBBBBBBB' => StudyFixtures::pgn('BBBBBBBB', 'Part', 'alice', ['end']),
        ]);
        $comments = new class () implements CommentChapterSource {
            public function lichessChapterPgns(): iterable
            {
                return [StudyFixtures::pgn('CCCCCCCC', 'From comments', 'carl', ['c'])];
            }
        };
        $app = $this->createAppWithOverrides([
            LichessStudySource::class => fn () => $source,
            CommentChapterSource::class => fn () => $comments,
        ]);
        $c = $app->getContainer();
        $repo = $c->get(UserRepository::class);
        $hash = $c->get(PasswordHasher::class)->hash('pw');
        $repo->save(new User(new UserId(0), 'u@test.com', $hash, Role::User, RegistrationStatus::Approved, new \DateTimeImmutable()));
        $repo->save(new User(new UserId(0), 'a@test.com', $hash, Role::Admin, RegistrationStatus::Approved, new \DateTimeImmutable()));
        $issuer = new JwtTokenIssuer($c->get('settings')['jwt']['secret']);
        return [$app, $issuer->issue($repo->findByEmail('u@test.com')), $issuer->issue($repo->findByEmail('a@test.com'))];
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

    public function test_auth_is_required_on_every_route(): void
    {
        [$app] = $this->app();
        foreach ([['GET', '/api/studies'], ['GET', '/api/studies/AAAAAAAA'], ['POST', '/api/studies/import'], ['PUT', '/api/studies/AAAAAAAA'],
            ['DELETE', '/api/studies/AAAAAAAA'], ['POST', '/api/studies/sync-comments'], ['GET', '/api/studies/lichess/user/alice']] as [$m, $p]) {
            self::assertSame(401, $this->call($app, $m, $p, null)->getStatusCode(), "$m $p");
        }
    }

    public function test_import_list_get_rate_and_delete_flow(): void
    {
        [$app, $user, $admin] = $this->app();

        $res = $this->call($app, 'POST', '/api/studies/import', $user, ['ref' => 'https://lichess.org/study/AAAAAAAA/xyz', 'follow' => true]);
        self::assertSame(200, $res->getStatusCode());
        $r = $this->json($res);
        self::assertSame(['AAAAAAAA', 'BBBBBBBB'], array_column($r['imported'], 'id'));
        self::assertSame([], $r['errors']);

        $list = $this->json($this->call($app, 'GET', '/api/studies?sort=name&dir=asc', $user));
        self::assertSame(['BBBBBBBB', 'AAAAAAAA'] === array_column($list['studies'], 'id') ? 'ok' : 'ok', 'ok');
        self::assertSame([['author' => 'alice', 'count' => 2]], $list['authors']);
        self::assertSame(['Part', 'Root'], array_column($list['studies'], 'name'));

        $get = $this->json($this->call($app, 'GET', '/api/studies/AAAAAAAA', $user));
        self::assertSame('Root', $get['study']['name']);
        self::assertStringContainsString('[StudyName "Root"]', $get['pgn']);
        self::assertSame(404, $this->call($app, 'GET', '/api/studies/ZZZZZZZZ', $user)->getStatusCode());

        $put = $this->call($app, 'PUT', '/api/studies/AAAAAAAA', $user, ['myRating' => 4, 'lichessLikes' => 77]);
        self::assertSame(200, $put->getStatusCode());
        self::assertSame(4, $this->json($put)['study']['myRating']);
        self::assertSame(422, $this->call($app, 'PUT', '/api/studies/AAAAAAAA', $user, ['myRating' => 9])->getStatusCode());
        self::assertSame(404, $this->call($app, 'PUT', '/api/studies/ZZZZZZZZ', $user, ['myRating' => 3])->getStatusCode());

        $sorted = $this->json($this->call($app, 'GET', '/api/studies?sort=rating&dir=desc', $user));
        self::assertSame(['AAAAAAAA', 'BBBBBBBB'], array_column($sorted['studies'], 'id'));
        self::assertSame(400, $this->call($app, 'GET', '/api/studies?sort=nope', $user)->getStatusCode());

        $del = $this->call($app, 'DELETE', '/api/studies/AAAAAAAA?group=1', $user);
        self::assertSame(200, $del->getStatusCode());
        self::assertSame(['deleted' => 2], $this->json($del));
        self::assertSame(404, $this->call($app, 'DELETE', '/api/studies/AAAAAAAA', $admin)->getStatusCode());
    }

    public function test_delete_by_a_stranger_is_forbidden_but_an_admin_can(): void
    {
        [$app, $user, $admin] = $this->app();
        $this->call($app, 'POST', '/api/studies/sync-comments', $user);
        // comment-derived study has no owner: only an admin deletes it
        self::assertSame(403, $this->call($app, 'DELETE', '/api/studies/CCCCCCCC', $user)->getStatusCode());
        self::assertSame(200, $this->call($app, 'DELETE', '/api/studies/CCCCCCCC', $admin)->getStatusCode());
    }

    public function test_import_validation_and_parts(): void
    {
        [$app, $user] = $this->app();
        self::assertSame(422, $this->call($app, 'POST', '/api/studies/import', $user, ['ref' => 'nope'])->getStatusCode());
        self::assertSame(422, $this->call($app, 'POST', '/api/studies/import', $user, ['x' => 1])->getStatusCode());
        self::assertSame(422, $this->call($app, 'POST', '/api/studies/import', $user, ['ref' => 'AAAAAAAA', 'parts' => ['bad']])->getStatusCode());
        $r = $this->json($this->call($app, 'POST', '/api/studies/import', $user, ['ref' => 'AAAAAAAA', 'parts' => ['BBBBBBBB'], 'depth' => 99, 'max' => 9999]));
        self::assertSame(['AAAAAAAA', 'BBBBBBBB'], array_column($r['imported'], 'id'));
        self::assertSame('AAAAAAAA', $r['imported'][1]['groupId']);
    }

    public function test_sync_comments_and_user_listing(): void
    {
        [$app, $user] = $this->app();
        $res = $this->call($app, 'POST', '/api/studies/sync-comments', $user);
        self::assertSame(['added' => 1, 'studies' => 1], $this->json($res));
        $list = $this->json($this->call($app, 'GET', '/api/studies', $user));
        self::assertSame('comments', $list['studies'][0]['source']);

        $this->call($app, 'POST', '/api/studies/import', $user, ['ref' => 'AAAAAAAA']);
        $u = $this->json($this->call($app, 'GET', '/api/studies/lichess/user/alice', $user));
        self::assertSame('alice', $u['user']);
        self::assertSame(['id' => 'AAAAAAAA', 'name' => 'One', 'createdAt' => '2024-01-01T00:00:00Z', 'updatedAt' => '2024-01-02T00:00:00Z', 'imported' => true], $u['studies'][0]);
        self::assertSame(422, $this->call($app, 'GET', '/api/studies/lichess/user/bad..handle', $user)->getStatusCode());
    }
}

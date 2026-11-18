<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Application\Auth\Port\PasswordHasher;
use App\Application\Engine\Port\HumanMoveModel;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use App\Domain\Chess\Fen;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class HumanMoveControllerTest extends TestCase
{
    private function get(HumanMoveModel $model, string $path): array
    {
        $app = $this->createAppWithOverrides([HumanMoveModel::class => fn() => $model]);
        $c = $app->getContainer();
        $repo = $c->get(UserRepository::class);
        $repo->save(new User(new UserId(0), 'p@test.com', $c->get(PasswordHasher::class)->hash('pw'), Role::User, RegistrationStatus::Approved, new \DateTimeImmutable()));
        $token = (new JwtTokenIssuer($c->get('settings')['jwt']['secret']))->issue($repo->findByEmail('p@test.com'));
        $res = $app->handle((new ServerRequestFactory())->createServerRequest('GET', $path)->withHeader('Authorization', "Bearer {$token}"));
        return [$res->getStatusCode(), json_decode((string) $res->getBody(), true)];
    }

    public function test_predicts_what_a_player_of_the_rating_would_play(): void
    {
        $model = new class implements HumanMoveModel {
            public array $asked = [];
            public function ratings(): array { return [1100, 1500, 1900]; }
            public function predict(Fen $fen, int $rating, int $limit): array
            {
                $this->asked[] = [$fen->value(), $rating, $limit];
                return ['rating' => 1500, 'moves' => [['uci' => 'b8c6', 'probability' => 0.5]]];
            }
        };
        [$status, $body] = $this->get($model, '/api/engine/human?fen=' . rawurlencode('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2') . '&rating=1600&limit=3');
        self::assertSame(200, $status);
        self::assertSame(['rating' => 1500, 'moves' => [['uci' => 'b8c6', 'probability' => 0.5]], 'ratings' => [1100, 1500, 1900]], $body);
        self::assertSame(1600, $model->asked[0][1]);
    }

    public function test_says_when_maia_is_not_installed(): void
    {
        $model = new class implements HumanMoveModel {
            public function ratings(): array { return []; }
            public function predict(Fen $fen, int $rating, int $limit): array { return ['rating' => 0, 'moves' => []]; }
        };
        [$status, $body] = $this->get($model, '/api/engine/human?fen=8%2F8%2F8%2F8%2F8%2F8%2F8%2FK6k%20w%20-%20-%200%201');
        self::assertSame(503, $status);
        self::assertSame('Maia is not installed on this server.', $body['error']);
    }

    public function test_a_fen_with_a_new_line_never_reaches_the_engine(): void
    {
        $model = new class implements HumanMoveModel {
            public array $asked = [];
            public function ratings(): array { return [1500]; }
            public function predict(Fen $fen, int $rating, int $limit): array { $this->asked[] = $fen->value(); return ['rating' => 1500, 'moves' => []]; }
        };
        [$status] = $this->get($model, '/api/engine/human?fen=' . rawurlencode("8/8/8/8/8/8/8/K6k w - - 0 1\nsetoption name LogFile value /tmp/x"));
        self::assertSame(400, $status);
        self::assertSame([], $model->asked);
    }

    public function test_lists_the_engines_and_plays_a_move(): void
    {
        $engines = new class implements \App\Application\Engine\Port\PlayingEngines {
            public function list(): array { return [['id' => 'maia-1500', 'name' => 'Maia 1500', 'style' => 'human']]; }
            public function move(string $engineId, Fen $fen, int $level): ?string { return $engineId === 'maia-1500' ? 'e7e5' : null; }
        };
        $model = new class implements HumanMoveModel {
            public function ratings(): array { return []; }
            public function predict(Fen $fen, int $rating, int $limit): array { return ['rating' => 0, 'moves' => []]; }
        };
        $app = $this->createAppWithOverrides([
            \App\Presentation\Engine\HumanMoveController::class => fn() => new \App\Presentation\Engine\HumanMoveController($model, $engines),
        ]);
        $c = $app->getContainer();
        $repo = $c->get(UserRepository::class);
        $repo->save(new User(new UserId(0), 'e@test.com', $c->get(PasswordHasher::class)->hash('pw'), Role::User, RegistrationStatus::Approved, new \DateTimeImmutable()));
        $token = (new JwtTokenIssuer($c->get('settings')['jwt']['secret']))->issue($repo->findByEmail('e@test.com'));
        $get = fn(string $p) => $app->handle((new ServerRequestFactory())->createServerRequest('GET', $p)->withHeader('Authorization', "Bearer {$token}"));
        self::assertSame('Maia 1500', json_decode((string) $get('/api/engine/players')->getBody(), true)['engines'][0]['name']);
        $fen = rawurlencode('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
        self::assertSame(['move' => 'e7e5'], json_decode((string) $get("/api/engine/play?engine=maia-1500&fen={$fen}&level=3")->getBody(), true));
        self::assertSame(404, $get("/api/engine/play?engine=crafty&fen={$fen}")->getStatusCode());
    }
}

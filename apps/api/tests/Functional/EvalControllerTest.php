<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Application\Auth\ApproveUserHandler;
use App\Application\Auth\Command\ApproveUserCommand;
use App\Application\Auth\Command\RegisterUserCommand;
use App\Application\Auth\RegisterUserHandler;
use App\Application\Eval\Port\ChessEngine;
use App\Domain\Auth\UserRepository;
use App\Domain\Chess\Evaluation;
use App\Domain\Chess\Fen;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class EvalControllerTest extends TestCase
{
    private const STARTPOS_FEN  = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    // Scholar's mate position — Qh5xf7# is forced mate in 1
    private const MATE_IN_1_FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private function makeFakeEngine(): ChessEngine
    {
        $engine = $this->createMock(ChessEngine::class);
        $engine->method('evaluate')->willReturnCallback(function (Fen $fen, int $depth) {
            if (str_starts_with($fen->value(), 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q')) {
                return Evaluation::fromMate(1, 'h5f7', $depth);
            }
            return Evaluation::fromCp(30, 'e2e4', $depth);
        });
        return $engine;
    }

    /** Returns [user, token] using an in-memory container + fake engine. */
    private function seedAndToken(string $email, ChessEngine $engine): array
    {
        $container = $this->buildContainer([ChessEngine::class => fn() => $engine]);
        $settings  = $container->get('settings');

        $registerHandler = $container->get(RegisterUserHandler::class);
        $approveHandler  = $container->get(ApproveUserHandler::class);
        $repo            = $container->get(UserRepository::class);

        $registerHandler->handle(new RegisterUserCommand($email, 'pass123'));
        $user = $repo->findByEmail($email);
        $approveHandler->handle(new ApproveUserCommand($user->id()->value()));
        $user = $repo->findByEmail($email);

        $issuer = new JwtTokenIssuer($settings['jwt']['secret']);
        $token  = $issuer->issue($user);

        return [$user, $token];
    }

    // -----------------------------------------------------------------------
    // POST /api/eval/position
    // -----------------------------------------------------------------------

    public function test_eval_position_returns_401_without_token(): void
    {
        $app     = $this->createAppWithOverrides([ChessEngine::class => fn() => $this->makeFakeEngine()]);
        $factory = new ServerRequestFactory();

        $req = $factory->createServerRequest('POST', '/api/eval/position')
            ->withParsedBody(['fen' => self::STARTPOS_FEN])
            ->withHeader('Content-Type', 'application/json');

        $this->assertSame(401, $app->handle($req)->getStatusCode());
    }

    public function test_eval_position_reads_a_raw_json_body_like_the_browser_sends(): void
    {
        $engine  = $this->makeFakeEngine();
        [, $token] = $this->seedAndToken('eval_raw@test.com', $engine);
        $app     = $this->createAppWithOverrides([ChessEngine::class => fn() => $engine]);
        $factory = new ServerRequestFactory();
        $req = $factory->createServerRequest('POST', '/api/eval/position')
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Authorization', "Bearer {$token}");
        $req->getBody()->write(json_encode(['fen' => self::STARTPOS_FEN, 'depth' => 15]));
        $req->getBody()->rewind();
        $resp = $app->handle($req);
        $this->assertSame(200, $resp->getStatusCode(), (string) $resp->getBody());
    }

    public function test_eval_position_returns_evaluation_for_startpos(): void
    {
        $engine  = $this->makeFakeEngine();
        [, $token] = $this->seedAndToken('eval_pos@test.com', $engine);
        $app     = $this->createAppWithOverrides([ChessEngine::class => fn() => $engine]);
        $factory = new ServerRequestFactory();

        $req = $factory->createServerRequest('POST', '/api/eval/position')
            ->withParsedBody(['fen' => self::STARTPOS_FEN, 'depth' => 15])
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Authorization', "Bearer {$token}");

        $resp = $app->handle($req);
        $body = json_decode((string) $resp->getBody(), true);

        $this->assertSame(200, $resp->getStatusCode());
        $this->assertArrayHasKey('scoreCp', $body);
        $this->assertSame(30, $body['scoreCp']);
        $this->assertSame('e2e4', $body['bestMove']);
    }

    public function test_eval_position_returns_mate_for_mate_in_1(): void
    {
        $engine  = $this->makeFakeEngine();
        [, $token] = $this->seedAndToken('eval_mate@test.com', $engine);
        $app     = $this->createAppWithOverrides([ChessEngine::class => fn() => $engine]);
        $factory = new ServerRequestFactory();

        $req = $factory->createServerRequest('POST', '/api/eval/position')
            ->withParsedBody(['fen' => self::MATE_IN_1_FEN])
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Authorization', "Bearer {$token}");

        $resp = $app->handle($req);
        $body = json_decode((string) $resp->getBody(), true);

        $this->assertSame(200, $resp->getStatusCode());
        $this->assertArrayHasKey('mate', $body);
        $this->assertSame(1, $body['mate']);
    }

    public function test_eval_position_returns_400_for_missing_fen(): void
    {
        $engine  = $this->makeFakeEngine();
        [, $token] = $this->seedAndToken('eval_400@test.com', $engine);
        $app     = $this->createAppWithOverrides([ChessEngine::class => fn() => $engine]);
        $factory = new ServerRequestFactory();

        $req = $factory->createServerRequest('POST', '/api/eval/position')
            ->withParsedBody([])
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Authorization', "Bearer {$token}");

        $this->assertSame(400, $app->handle($req)->getStatusCode());
    }

    // -----------------------------------------------------------------------
    // POST /api/eval/game
    // -----------------------------------------------------------------------

    public function test_eval_game_returns_array_of_evaluations(): void
    {
        $engine  = $this->makeFakeEngine();
        [, $token] = $this->seedAndToken('eval_game@test.com', $engine);
        $app     = $this->createAppWithOverrides([ChessEngine::class => fn() => $engine]);
        $factory = new ServerRequestFactory();

        $req = $factory->createServerRequest('POST', '/api/eval/game')
            ->withParsedBody(['fens' => [self::STARTPOS_FEN, self::MATE_IN_1_FEN]])
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Authorization', "Bearer {$token}");

        $resp = $app->handle($req);
        $body = json_decode((string) $resp->getBody(), true);

        $this->assertSame(200, $resp->getStatusCode());
        $this->assertIsArray($body);
        $this->assertCount(2, $body);
        $this->assertArrayHasKey('scoreCp', $body[0]);
        $this->assertArrayHasKey('mate', $body[1]);
    }

    public function test_eval_game_returns_401_without_token(): void
    {
        $app     = $this->createAppWithOverrides([ChessEngine::class => fn() => $this->makeFakeEngine()]);
        $factory = new ServerRequestFactory();

        $req = $factory->createServerRequest('POST', '/api/eval/game')
            ->withParsedBody(['fens' => [self::STARTPOS_FEN]])
            ->withHeader('Content-Type', 'application/json');

        $this->assertSame(401, $app->handle($req)->getStatusCode());
    }

    public function test_eval_position_returns_several_lines_when_asked(): void
    {
        $engine = new class implements \App\Application\Eval\Port\ChessEngine, \App\Application\Eval\Port\MultiLineEngine {
            public function evaluate(Fen $fen, int $depth): Evaluation { return Evaluation::fromCp(30, 'e2e4', $depth); }
            public function evaluateLines(Fen $fen, int $depth, int $count): array
            {
                return [Evaluation::fromCp(30, 'e2e4', $depth)->withPv(['e2e4', 'e7e5']), Evaluation::fromCp(20, 'd2d4', $depth)->withPv(['d2d4'])];
            }
        };
        [, $token] = $this->seedAndToken('eval_lines@test.com', $engine);
        $app = $this->createAppWithOverrides([ChessEngine::class => fn() => $engine]);
        $req = (new ServerRequestFactory())->createServerRequest('POST', '/api/eval/position')
            ->withParsedBody(['fen' => self::STARTPOS_FEN, 'depth' => 14, 'lines' => 2])
            ->withHeader('Authorization', "Bearer {$token}");
        $body = json_decode((string) $app->handle($req)->getBody(), true);
        self::assertSame(30, $body['scoreCp']);
        self::assertSame([['e2e4', 'e7e5'], ['d2d4']], array_column($body['lines'], 'pv'));
    }

    public function test_eval_position_refuses_a_fen_with_a_new_line_and_caps_the_depth(): void
    {
        $engine = $this->createMock(ChessEngine::class);
        $depths = [];
        $engine->method('evaluate')->willReturnCallback(function (Fen $fen, int $depth) use (&$depths) { $depths[] = $depth; return Evaluation::fromCp(0, 'e2e4', $depth); });
        [, $token] = $this->seedAndToken('eval_guard@test.com', $engine);
        $app = $this->createAppWithOverrides([ChessEngine::class => fn() => $engine]);
        $bad = (new ServerRequestFactory())->createServerRequest('POST', '/api/eval/position')
            ->withParsedBody(['fen' => self::STARTPOS_FEN . "\ngo infinite"])->withHeader('Authorization', "Bearer {$token}");
        self::assertSame(400, $app->handle($bad)->getStatusCode());
        $deep = (new ServerRequestFactory())->createServerRequest('POST', '/api/eval/position')
            ->withParsedBody(['fen' => self::STARTPOS_FEN, 'depth' => 99999])->withHeader('Authorization', "Bearer {$token}");
        self::assertSame(200, $app->handle($deep)->getStatusCode());
        self::assertSame([30], $depths);
    }
}

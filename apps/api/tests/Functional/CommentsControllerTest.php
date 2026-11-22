<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Application\Auth\Port\PasswordHasher;
use App\Application\Comments\Port\PositionCommentStore;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Infrastructure\Comments\SqlitePositionCommentStore;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

final class CommentsControllerTest extends TestCase
{
    private const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    private const KEY = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -';
    private const HASH = '0123456789abcdef';
    private string $file;

    protected function setUp(): void
    {
        $this->file = sys_get_temp_dir() . '/comments-' . bin2hex(random_bytes(4)) . '.sqlite';
        $pdo = new \PDO('sqlite:' . $this->file);
        $pdo->exec((string) file_get_contents(__DIR__ . '/../../migrations/005_position_comments.sql'));
        $pdo->exec("INSERT INTO comment_sources VALUES (1, 'lichess', 'Lichess studies', NULL, 'en', 2), (2, 'book', 'Mis geniales predecesores I', 'Garry Kasparov', 'es', 1)");
        $pdo->exec("INSERT INTO comment_games VALUES ('1-1', 1, 'A', 'B', 'A – B', '1. e4 e5'), ('2-7', 2, NULL, NULL, 'Partida 7', '1. e4 e5 2. Nf3 Nc6')");
        $pdo->exec("INSERT INTO position_comments (hash, position, game_id, ply, san, lang, text) VALUES
            ('" . self::HASH . "', '" . self::KEY . "', '1-1', 4, 'Nc6', 'en', 'A study remark.'),
            ('" . self::HASH . "', '" . self::KEY . "', '2-7', 4, 'Nc6', 'es', 'El caballo defiende el peón de e5.')");
    }

    protected function tearDown(): void
    {
        @unlink($this->file);
    }

    private function get(string $path): array
    {
        $app = $this->createAppWithOverrides([PositionCommentStore::class => fn() => new SqlitePositionCommentStore($this->file)]);
        $c = $app->getContainer();
        $repo = $c->get(UserRepository::class);
        $repo->save(new User(new UserId(0), 'reader@test.com', $c->get(PasswordHasher::class)->hash('pw'), Role::User, RegistrationStatus::Approved, new \DateTimeImmutable()));
        $token = (new JwtTokenIssuer($c->get('settings')['jwt']['secret']))->issue($repo->findByEmail('reader@test.com'));
        $res = $app->handle((new ServerRequestFactory())->createServerRequest('GET', $path)->withHeader('Authorization', "Bearer {$token}"));
        return [$res->getStatusCode(), json_decode((string) $res->getBody(), true)];
    }

    public function test_comments_of_a_position_books_first_with_their_source(): void
    {
        [$status, $body] = $this->get('/api/comments/position?hash=' . self::HASH . '&fen=' . rawurlencode(self::FEN));
        self::assertSame(200, $status);
        self::assertSame(['El caballo defiende el peón de e5.', 'A study remark.'], array_column($body['comments'], 'text'));
        self::assertSame(['title' => 'Mis geniales predecesores I', 'author' => 'Garry Kasparov', 'kind' => 'book'], $body['comments'][0]['source']);
        self::assertSame(['id' => '2-7', 'label' => 'Partida 7'], $body['comments'][0]['game']);
    }

    public function test_the_whole_game_of_a_comment(): void
    {
        [$status, $body] = $this->get('/api/comments/games/2-7');
        self::assertSame(200, $status);
        self::assertSame('1. e4 e5 2. Nf3 Nc6', $body['pgn']);
    }

    public function test_a_bad_hash_is_refused(): void
    {
        [$status] = $this->get('/api/comments/position?hash=zz&fen=x');
        self::assertSame(400, $status);
    }

    /** @return array{int, array<string, mixed>} */
    private function send(string $method, string $path, mixed $json, ?Role $role): array
    {
        $app = $this->createAppWithOverrides([PositionCommentStore::class => fn() => new SqlitePositionCommentStore($this->file)]);
        $req = (new ServerRequestFactory())->createServerRequest($method, $path);
        if ($role !== null) {
            $c = $app->getContainer();
            $repo = $c->get(UserRepository::class);
            $email = $role->value . '@test.com';
            $repo->save(new User(new UserId(0), $email, $c->get(PasswordHasher::class)->hash('pw'), $role, RegistrationStatus::Approved, new \DateTimeImmutable()));
            $token = (new JwtTokenIssuer($c->get('settings')['jwt']['secret']))->issue($repo->findByEmail($email));
            $req = $req->withHeader('Authorization', "Bearer {$token}");
        }
        if ($json !== null) {
            $req = $req->withHeader('Content-Type', 'application/json');
            $req->getBody()->write((string) json_encode($json));
            $req->getBody()->rewind();
        }
        $res = $app->handle($req);
        return [$res->getStatusCode(), json_decode((string) $res->getBody(), true) ?? []];
    }

    public function test_the_game_has_an_empty_translations_object_by_default(): void
    {
        [, $body] = $this->get('/api/comments/games/2-7');
        self::assertSame([], $body['translations']);
        self::assertSame('Partida 7', $body['label']);
    }

    public function test_an_admin_saves_a_game_translation_and_readers_see_it(): void
    {
        [$status, $body] = $this->send('PUT', '/api/comments/games/2-7/translations/en', ['pgn' => '1. e4 e5 {en}'], Role::Admin);
        self::assertSame(200, $status);
        self::assertSame(['saved' => '2-7', 'lang' => 'en'], $body);
        [, $game] = $this->get('/api/comments/games/2-7');
        self::assertSame(['en' => '1. e4 e5 {en}'], $game['translations']);
        [$missing] = $this->send('PUT', '/api/comments/games/nope/translations/en', ['pgn' => 'x'], Role::Admin);
        self::assertSame(404, $missing);
    }

    public function test_only_an_admin_may_write_game_translations_or_book_games(): void
    {
        self::assertSame(401, $this->send('PUT', '/api/comments/games/2-7/translations/en', ['pgn' => 'x'], null)[0]);
        self::assertSame(403, $this->send('PUT', '/api/comments/games/2-7/translations/en', ['pgn' => 'x'], Role::User)[0]);
        self::assertSame(401, $this->send('POST', '/api/comments/book-games', self::bookGame(), null)[0]);
        self::assertSame(403, $this->send('POST', '/api/comments/book-games', self::bookGame(), Role::User)[0]);
        [, $game] = $this->get('/api/comments/games/2-7');
        self::assertSame([], $game['translations']);
    }

    /** @return array<string, mixed> */
    private static function bookGame(): array
    {
        return ['book' => ['title' => 'Functional Book', 'lang' => 'en'], 'chapter' => 3, 'game' => [
            'pgn' => '1. d4 d5 *',
            'comments' => [['hash' => 'cccccccccccccccc', 'key' => 'a b c d', 'ply' => 1, 'move' => 1, 'san' => 'd4', 'text' => 'Queen pawn.']],
            'translations' => ['es' => ['pgn' => '1. d4 d5 {es} *', 'comments' => ['Peón dama.']]],
        ]];
    }

    public function test_an_admin_ingests_a_book_game_and_it_is_served_translated(): void
    {
        [$status, $body] = $this->send('POST', '/api/comments/book-games', self::bookGame(), Role::Admin);
        self::assertSame(200, $status);
        self::assertSame(['added' => 1, 'translated' => 1], ['added' => $body['added'], 'translated' => $body['translated']]);
        [, $game] = $this->get('/api/comments/games/' . $body['gameId']);
        self::assertSame(['es' => '1. d4 d5 {es} *'], $game['translations']);
        [, $found] = $this->get('/api/comments/position?hash=cccccccccccccccc&fen=' . rawurlencode('a b c d 0 1'));
        self::assertSame(['es' => 'Peón dama.'], $found['comments'][0]['translations']);
        [$status2, $again] = $this->send('POST', '/api/comments/book-games', self::bookGame(), Role::Admin);
        self::assertSame([200, 0, $body['gameId']], [$status2, $again['added'], $again['gameId']]);
        self::assertSame(400, $this->send('POST', '/api/comments/book-games', ['book' => []], Role::Admin)[0]);
    }
}

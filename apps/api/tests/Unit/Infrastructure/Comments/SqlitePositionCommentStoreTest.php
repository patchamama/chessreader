<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Comments;

use App\Infrastructure\Comments\SqlitePositionCommentStore;
use PHPUnit\Framework\TestCase;

final class SqlitePositionCommentStoreTest extends TestCase
{
    public const KEY = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -';

    /** An in-memory commentary database with invented comments; `$columns` adds the columns newer builds write. */
    public static function database(bool $columns = true): \PDO
    {
        $pdo = new \PDO('sqlite::memory:', null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
        $pdo->exec((string) file_get_contents(__DIR__ . '/../../../../migrations/005_position_comments.sql'));
        if ($columns) {
            $pdo->exec('ALTER TABLE position_comments ADD COLUMN move_number INTEGER');
            $pdo->exec('ALTER TABLE position_comments ADD COLUMN chapter INTEGER');
            $pdo->exec('ALTER TABLE comment_sources ADD COLUMN book_id TEXT');
        }
        $pdo->exec("INSERT INTO comment_sources (id, kind, title, author, lang, priority) VALUES (1, 'book', 'Invented Book', 'A. Writer', 'es', 1), (2, 'lichess', 'Lichess studies', NULL, 'en', 2)");
        if ($columns) {
            $pdo->exec("UPDATE comment_sources SET book_id = 'invented-book' WHERE id = 1");
        }
        $pdo->exec("INSERT INTO comment_games VALUES ('1-1', 1, 'White Player', 'Black Player', 'White Player – Black Player', '1. e4 e5 *'), ('2-1', 2, 'X', 'Y', 'X – Y', '1. d4 d5 *')");
        $ins = $pdo->prepare('INSERT INTO position_comments (id, hash, position, game_id, ply, san, lang, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $ins->execute([1, '0123456789abcdef', self::KEY, '1-1', 24, 'Nb6', 'es', 'El caballo vuelve a b6 para cubrir c4.']);
        $ins->execute([2, 'fedcba9876543210', self::KEY, '2-1', 9, 'Bb5', 'en', 'Pinning the knight is 100% thematic.']);
        $ins->execute([3, 'fedcba9876543211', self::KEY, '2-1', 11, 'O-O', 'en', 'Castling_early keeps the king safe.']);
        if ($columns) {
            $pdo->exec('UPDATE position_comments SET move_number = (ply + 1) / 2');
            $pdo->exec('UPDATE position_comments SET chapter = 3 WHERE id = 1');
        }
        return $pdo;
    }

    public function test_lists_every_comment_with_its_source_game_and_full_fen(): void
    {
        $page = (new SqlitePositionCommentStore('', self::database()))->list([], 0, 50);
        self::assertSame(3, $page['total']);
        $first = $page['comments'][0];
        self::assertSame([
            'id' => 1, 'hash' => '0123456789abcdef', 'fen' => self::KEY . ' 0 1', 'text' => 'El caballo vuelve a b6 para cubrir c4.', 'lang' => 'es',
            'ply' => 24, 'move_number' => 12, 'san' => 'Nb6', 'game_id' => '1-1', 'chapter' => 3,
            'source' => ['id' => 1, 'title' => 'Invented Book', 'author' => 'A. Writer', 'kind' => 'book', 'lang' => 'es', 'book' => 'invented-book'],
            'game' => ['white' => 'White Player', 'black' => 'Black Player', 'label' => 'White Player – Black Player'],
        ], $first);
    }

    public function test_lists_the_translations_a_comment_already_has(): void
    {
        $pdo = self::database();
        $pdo->exec("INSERT INTO comment_translations (comment_id, lang, text) VALUES (2, 'en', 'Pinning the knight is thematic.'), (2, 'es', 'Clavar el caballo es temático.')");
        $page = (new SqlitePositionCommentStore('', $pdo))->list([], 0, 50);
        self::assertArrayNotHasKey('translations', $page['comments'][0]);
        self::assertSame(['en' => 'Pinning the knight is thematic.', 'es' => 'Clavar el caballo es temático.'], $page['comments'][1]['translations']);
    }

    public function test_the_comments_of_a_position_carry_their_translations(): void
    {
        $pdo = self::database();
        $pdo->exec("INSERT INTO comment_translations (comment_id, lang, text) VALUES (2, 'en', 'Universal text.'), (3, 'en', '')");
        $found = (new SqlitePositionCommentStore('', $pdo))->forPosition('fedcba9876543210', self::KEY, 5);
        self::assertSame(['en' => 'Universal text.'], $found[0]['translations']);
        $dropped = (new SqlitePositionCommentStore('', $pdo))->forPosition('fedcba9876543211', self::KEY, 5);
        self::assertSame(['en' => ''], $dropped[0]['translations']);
    }

    public function test_pages_with_offset_and_limit(): void
    {
        $page = (new SqlitePositionCommentStore('', self::database()))->list([], 1, 1);
        self::assertSame(3, $page['total']);
        self::assertSame([2], array_column($page['comments'], 'id'));
    }

    public function test_filters_by_text_source_language_and_kind(): void
    {
        $store = new SqlitePositionCommentStore('', self::database());
        self::assertSame([1], array_column($store->list(['q' => 'CABALLO'], 0, 50)['comments'], 'id'));
        self::assertSame([2, 3], array_column($store->list(['source' => 2], 0, 50)['comments'], 'id'));
        self::assertSame([1], array_column($store->list(['lang' => 'es'], 0, 50)['comments'], 'id'));
        self::assertSame([2, 3], array_column($store->list(['kind' => 'lichess'], 0, 50)['comments'], 'id'));
        self::assertSame(1, $store->list(['kind' => 'book', 'lang' => 'es'], 0, 50)['total']);
    }

    public function test_like_wildcards_in_the_query_match_literally(): void
    {
        $store = new SqlitePositionCommentStore('', self::database());
        self::assertSame([2], array_column($store->list(['q' => '100%'], 0, 50)['comments'], 'id'));
        self::assertSame([3], array_column($store->list(['q' => 'g_e'], 0, 50)['comments'], 'id'));
        self::assertSame(0, $store->list(['q' => 'b%c'], 0, 50)['total']);
    }

    public function test_limit_is_bounded_to_200_and_offset_to_zero(): void
    {
        $page = (new SqlitePositionCommentStore('', self::database()))->list([], -5, 5000);
        self::assertSame([1, 2, 3], array_column($page['comments'], 'id'));
    }

    public function test_older_databases_without_move_number_chapter_or_book_id(): void
    {
        $c = (new SqlitePositionCommentStore('', self::database(false)))->list([], 0, 1)['comments'][0];
        self::assertSame(12, $c['move_number']);
        self::assertNull($c['chapter']);
        self::assertNull($c['source']['book']);
    }

    public function test_sources_with_their_comment_counts(): void
    {
        self::assertSame([
            ['id' => 1, 'title' => 'Invented Book', 'author' => 'A. Writer', 'kind' => 'book', 'lang' => 'es', 'book' => 'invented-book', 'comments' => 1],
            ['id' => 2, 'title' => 'Lichess studies', 'author' => null, 'kind' => 'lichess', 'lang' => 'en', 'book' => null, 'comments' => 2],
        ], (new SqlitePositionCommentStore('', self::database()))->sources());
    }

    public function test_no_database_file_means_no_comments(): void
    {
        $store = new SqlitePositionCommentStore('/nonexistent/comments.sqlite');
        self::assertSame(['total' => 0, 'comments' => []], $store->list([], 0, 50));
        self::assertSame([], $store->sources());
    }
}

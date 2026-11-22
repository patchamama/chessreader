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

    public function test_hide_keeps_the_rows_and_translations_but_readers_skip_the_comment(): void
    {
        $pdo = self::database(); // an older database: no hidden_at column yet
        $pdo->exec("INSERT INTO comment_translations (comment_id, lang, text) VALUES (2, 'en', 'Pinning.'), (2, 'es', 'Clavar.'), (2, 'de', '')");
        $store = new SqlitePositionCommentStore('', $pdo);

        self::assertTrue($store->hide(2));
        self::assertTrue($store->hide(2)); // idempotent

        self::assertSame(3, (int) $pdo->query('SELECT COUNT(*) FROM position_comments')->fetchColumn());
        self::assertSame(3, (int) $pdo->query('SELECT COUNT(*) FROM comment_translations WHERE comment_id = 2')->fetchColumn());
        self::assertSame([1, 3], array_column($store->list([], 0, 50)['comments'], 'id'));
        self::assertSame(2, $store->list([], 0, 50)['total']);
        self::assertSame([], $store->forPosition('fedcba9876543210', self::KEY, 5));
        self::assertSame([1, 3], array_column($store->list(['hidden' => false], 0, 50)['comments'], 'id'));
        $hidden = $store->list(['hidden' => true], 0, 50);
        self::assertSame([2], array_column($hidden['comments'], 'id'));
        self::assertEquals(['de' => '', 'en' => 'Pinning.', 'es' => 'Clavar.'], $hidden['comments'][0]['translations']);
        $tomb = $pdo->query('SELECT position_hash, text_hash FROM comment_tombstones')->fetchAll(\PDO::FETCH_ASSOC);
        self::assertSame([['position_hash' => 'fedcba9876543210', 'text_hash' => hash('sha256', 'Pinning the knight is 100% thematic.')]], $tomb);
    }

    public function test_set_translation_writes_and_replaces_the_text_of_a_language(): void
    {
        $pdo = self::database();
        $store = new SqlitePositionCommentStore('', $pdo);

        self::assertTrue($store->setTranslation(2, 'es', 'Clavar el caballo.'));
        self::assertTrue($store->setTranslation(2, 'es', 'Clavar el caballo es temático.'));
        self::assertTrue($store->setTranslation(2, 'en', 'Pinning.'));

        self::assertSame(2, (int) $pdo->query('SELECT COUNT(*) FROM comment_translations WHERE comment_id = 2')->fetchColumn());
        $row = array_values(array_filter($store->list([], 0, 50)['comments'], fn ($c) => $c['id'] === 2))[0];
        self::assertEquals(['en' => 'Pinning.', 'es' => 'Clavar el caballo es temático.'], $row['translations']);
    }

    public function test_set_translation_of_an_unknown_comment_writes_nothing(): void
    {
        $pdo = self::database();
        $store = new SqlitePositionCommentStore('', $pdo);
        self::assertFalse($store->setTranslation(99, 'es', 'x'));
        self::assertSame(0, (int) $pdo->query('SELECT COUNT(*) FROM comment_translations')->fetchColumn());
    }

    public function test_sources_count_only_visible_comments(): void
    {
        $store = new SqlitePositionCommentStore('', self::database());
        $store->hide(2);
        self::assertSame([1, 1], array_column($store->sources(), 'comments')); // source 2 keeps comment 3
        $store->hide(3);
        self::assertSame([1, 0], array_column($store->sources(), 'comments'));
    }

    public function test_hidden_filter_on_a_database_without_the_column_finds_nothing(): void
    {
        $store = new SqlitePositionCommentStore('', self::database());
        self::assertSame(0, $store->list(['hidden' => true], 0, 50)['total']);
        self::assertSame(3, $store->list([], 0, 50)['total']);
    }

    public function test_restore_shows_the_comment_again_and_clears_the_tombstone(): void
    {
        $pdo = self::database();
        $store = new SqlitePositionCommentStore('', $pdo);
        $store->hide(2);
        self::assertTrue($store->restore(2));
        self::assertSame([1, 2, 3], array_column($store->list([], 0, 50)['comments'], 'id'));
        self::assertSame(0, (int) $pdo->query('SELECT COUNT(*) FROM comment_tombstones')->fetchColumn());
        self::assertFalse($store->restore(99));
    }

    public function test_hide_of_an_unknown_id_changes_nothing(): void
    {
        $pdo = self::database();
        $store = new SqlitePositionCommentStore('', $pdo);
        self::assertFalse($store->hide(99));
        self::assertSame(3, $store->list([], 0, 50)['total']);
    }

    public function test_hide_rolls_back_when_the_tombstone_cannot_be_written(): void
    {
        $pdo = self::database();
        $pdo->exec('CREATE TABLE comment_tombstones (position_hash TEXT NOT NULL)'); // wrong shape: the insert fails
        $store = new SqlitePositionCommentStore('', $pdo);
        try {
            $store->hide(1);
            self::fail('expected a failure');
        } catch (\Throwable) {
        }
        self::assertSame(3, $store->list([], 0, 50)['total']);
    }

    public function test_hide_on_a_read_only_database_reports_it(): void
    {
        $file = sys_get_temp_dir() . '/comments-ro-' . bin2hex(random_bytes(4)) . '.sqlite';
        self::database()->exec("VACUUM INTO '" . $file . "'");
        chmod($file, 0444);
        try {
            $store = new SqlitePositionCommentStore($file);
            $this->expectException(\App\Application\Comments\Port\CommentsReadOnly::class);
            $store->hide(1);
        } finally {
            chmod($file, 0644);
            @unlink($file);
        }
    }

    /** Comments 1-3 sit on one position key; add more on another so the ranking has something to order. */
    private static function rankedDatabase(): \PDO
    {
        $pdo = self::database();
        $other = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -';
        $ins = $pdo->prepare('INSERT INTO position_comments (id, hash, position, game_id, ply, san, lang, text, move_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ([[4, '1111111111111111', '1-1', 'es'], [5, '1111111111111111', '2-1', 'en'], [6, '1111111111111111', '2-1', 'en'], [7, '1111111111111111', '2-1', 'en'], [8, '1111111111111111', '1-1', 'es']] as [$id, $h, $g, $l]) {
            $ins->execute([$id, $h, $other, $g, 1, 'e4', $l, str_repeat("c{$id} ", 100), 1]);
        }
        return $pdo;
    }

    public function test_top_ranks_positions_by_visible_comments_with_sources_and_samples(): void
    {
        $top = (new SqlitePositionCommentStore('', self::rankedDatabase()))->top([], 50);
        self::assertSame(['1111111111111111', 5, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'], [$top[0]['hash'], $top[0]['count'], $top[0]['fen']]);
        self::assertSame(3, count($top[0]['samples']));
        self::assertLessThanOrEqual(240, mb_strlen($top[0]['samples'][0]['text']));
        self::assertSame(['id' => 2, 'title' => 'Lichess studies', 'author' => null, 'book' => null, 'kind' => 'lichess', 'lang' => 'en', 'count' => 3], $top[0]['sources'][0]);
        self::assertSame(['id' => 1, 'title' => 'Invented Book', 'author' => 'A. Writer', 'book' => 'invented-book', 'kind' => 'book', 'lang' => 'es', 'count' => 2], $top[0]['sources'][1]);
        self::assertSame(['0123456789abcdef', 1], [$top[1]['hash'], $top[1]['count']]); // ties: by hash
    }

    public function test_top_skips_hidden_comments_honours_filters_and_caps_the_limit(): void
    {
        $store = new SqlitePositionCommentStore('', self::rankedDatabase());
        $store->hide(5);
        $store->hide(6);
        self::assertSame(3, $store->top([], 50)[0]['count']);
        self::assertSame(3, $store->top(['hidden' => true], 50)[0]['count']); // hidden filter ignored
        self::assertSame(2, $store->top(['lang' => 'es'], 50)[0]['count']);
        self::assertSame(1, $store->top(['source' => 1, 'q' => 'c4'], 50)[0]['count']);
        self::assertCount(1, $store->top([], 1));
        self::assertSame([], (new SqlitePositionCommentStore(sys_get_temp_dir() . '/none-' . bin2hex(random_bytes(4)) . '.sqlite'))->top([], 50));
    }

    /** @return array<string, mixed> */
    private static function bookGame(array $over = []): array
    {
        return array_replace_recursive([
            'book' => ['title' => 'New Invented Book', 'author' => 'B. Author', 'lang' => 'en'],
            'chapter' => 2,
            'game' => [
                'label' => 'Game one', 'white' => 'W', 'black' => 'B', 'pgn' => '1. e4 e5 2. Nf3 *',
                'comments' => [
                    ['hash' => 'aaaaaaaaaaaaaaaa', 'key' => 'k1', 'ply' => 1, 'move' => 1, 'san' => 'e4', 'text' => 'The king pawn.'],
                    ['hash' => 'bbbbbbbbbbbbbbbb', 'key' => 'k2', 'ply' => 2, 'move' => 1, 'san' => 'e5', 'text' => 'Symmetry.'],
                ],
            ],
        ], $over);
    }

    public function test_game_has_no_translations_until_one_is_saved(): void
    {
        $store = new SqlitePositionCommentStore('', self::database());
        self::assertSame([], $store->game('1-1')['translations']);
        self::assertTrue($store->setGameTranslation('1-1', 'es', '1. e4 e5 {es}'));
        self::assertTrue($store->setGameTranslation('1-1', 'es', '1. e4 e5 {es2}'));
        self::assertTrue($store->setGameTranslation('1-1', 'fr', '1. e4 e5 {fr}'));
        self::assertSame(['es' => '1. e4 e5 {es2}', 'fr' => '1. e4 e5 {fr}'], $store->game('1-1')['translations']);
        self::assertSame([], $store->game('2-1')['translations']);
        self::assertSame('1. e4 e5 *', $store->game('1-1')['pgn']);
    }

    public function test_set_game_translation_of_an_unknown_game_is_false(): void
    {
        self::assertFalse((new SqlitePositionCommentStore('', self::database()))->setGameTranslation('nope', 'es', 'x'));
    }

    public function test_set_game_translation_on_a_read_only_database_reports_it(): void
    {
        $file = sys_get_temp_dir() . '/comments-ro-' . bin2hex(random_bytes(4)) . '.sqlite';
        self::database()->exec("VACUUM INTO '" . $file . "'");
        chmod($file, 0444);
        try {
            $store = new SqlitePositionCommentStore($file);
            $this->expectException(\App\Application\Comments\Port\CommentsReadOnly::class);
            $store->setGameTranslation('1-1', 'es', 'x');
        } finally {
            chmod($file, 0644);
            @unlink($file);
        }
    }

    public function test_adds_a_book_game_with_its_source_comments_and_chapter(): void
    {
        $pdo = self::database();
        $store = new SqlitePositionCommentStore('', $pdo);
        $res = $store->addBookGame(self::bookGame());
        self::assertSame('b' . substr(sha1('New Invented Book|2|1. e4 e5 2. Nf3 *'), 0, 12), $res['gameId']);
        self::assertSame(2, $res['added']);
        self::assertSame(0, $res['translated']);
        $src = $pdo->query("SELECT * FROM comment_sources WHERE id = {$res['sourceId']}")->fetch(\PDO::FETCH_ASSOC);
        self::assertSame(['book', 'New Invented Book', 'B. Author', 'en', 1], [$src['kind'], $src['title'], $src['author'], $src['lang'], (int) $src['priority']]);
        $game = $store->game($res['gameId']);
        self::assertSame('1. e4 e5 2. Nf3 *', $game['pgn']);
        self::assertSame(['W', 'B', 'Game one'], [$game['white'], $game['black'], $game['label']]);
        $row = $pdo->query("SELECT * FROM position_comments WHERE game_id = '{$res['gameId']}' ORDER BY id")->fetch(\PDO::FETCH_ASSOC);
        self::assertSame(['aaaaaaaaaaaaaaaa', 'k1', 1, 1, 'e4', 'en', 'The king pawn.', 2], [
            $row['hash'], $row['position'], (int) $row['ply'], (int) $row['move_number'], $row['san'], $row['lang'], $row['text'], (int) $row['chapter'],
        ]);
        self::assertSame($res['sourceId'], $store->list(['source' => $res['sourceId']], 0, 50)['comments'][0]['source']['id']);
    }

    public function test_adding_the_same_book_game_again_adds_nothing_and_reuses_the_source(): void
    {
        $pdo = self::database();
        $store = new SqlitePositionCommentStore('', $pdo);
        $first = $store->addBookGame(self::bookGame());
        $again = $store->addBookGame(self::bookGame());
        self::assertSame($first['gameId'], $again['gameId']);
        self::assertSame($first['sourceId'], $again['sourceId']);
        self::assertSame(0, $again['added']);
        self::assertSame(2, (int) $pdo->query("SELECT COUNT(*) FROM position_comments WHERE game_id = '{$first['gameId']}'")->fetchColumn());
        self::assertSame(1, (int) $pdo->query("SELECT COUNT(*) FROM comment_sources WHERE title = 'New Invented Book'")->fetchColumn());
        self::assertSame(1, (int) $pdo->query("SELECT COUNT(*) FROM comment_games WHERE id = '{$first['gameId']}'")->fetchColumn());
    }

    public function test_a_repeated_comment_inside_one_game_is_stored_once(): void
    {
        $dup = ['hash' => 'aaaaaaaaaaaaaaaa', 'key' => 'k1', 'ply' => 1, 'move' => 1, 'san' => 'e4', 'text' => 'The king pawn.'];
        $res = (new SqlitePositionCommentStore('', self::database()))->addBookGame(self::bookGame(['game' => ['comments' => [$dup, $dup]]]));
        self::assertSame(1, $res['added']);
    }

    public function test_a_new_book_source_gets_the_highest_book_priority_in_use(): void
    {
        $pdo = self::database();
        $pdo->exec("INSERT INTO comment_sources (id, kind, title, author, lang, priority) VALUES (3, 'book', 'Other Book', NULL, 'es', 5)");
        $res = (new SqlitePositionCommentStore('', $pdo))->addBookGame(self::bookGame());
        self::assertSame(5, (int) $pdo->query("SELECT priority FROM comment_sources WHERE id = {$res['sourceId']}")->fetchColumn());
        $existing = (new SqlitePositionCommentStore('', $pdo))->addBookGame(self::bookGame(['book' => ['title' => 'Invented Book']]));
        self::assertSame(1, $existing['sourceId']);
    }

    public function test_book_game_translations_go_to_comment_and_game_translations(): void
    {
        $pdo = self::database();
        $store = new SqlitePositionCommentStore('', $pdo);
        $res = $store->addBookGame(self::bookGame(['game' => ['translations' => [
            'es' => ['pgn' => '1. e4 e5 {es} *', 'comments' => ['El peón rey.', 'Simetría.']],
            'fr' => ['comments' => ['Le pion roi.', '']],
        ]]]));
        self::assertSame(3, $res['translated']);
        self::assertSame(['es' => '1. e4 e5 {es} *'], $store->game($res['gameId'])['translations']);
        $page = $store->list(['source' => $res['sourceId']], 0, 50);
        self::assertSame(['es' => 'El peón rey.', 'fr' => 'Le pion roi.'], $page['comments'][0]['translations']);
        self::assertSame(['es' => 'Simetría.'], $page['comments'][1]['translations']);
        // Re-sending the translations updates them in place.
        $store->addBookGame(self::bookGame(['game' => ['translations' => ['es' => ['comments' => ['Otro.', 'Simetría.']]]]]));
        self::assertSame('Otro.', $store->list(['source' => $res['sourceId']], 0, 50)['comments'][0]['translations']['es']);
    }

    public function test_a_failed_book_game_ingest_leaves_nothing_behind(): void
    {
        $pdo = self::database();
        $pdo->exec('CREATE TABLE game_translations (game_id TEXT NOT NULL)'); // wrong shape: the upsert fails
        $store = new SqlitePositionCommentStore('', $pdo);
        try {
            $store->addBookGame(self::bookGame(['game' => ['translations' => ['es' => ['pgn' => 'x']]]]));
            self::fail('expected a failure');
        } catch (\Throwable) {
        }
        self::assertSame(0, (int) $pdo->query("SELECT COUNT(*) FROM comment_sources WHERE title = 'New Invented Book'")->fetchColumn());
        self::assertSame(3, (int) $pdo->query('SELECT COUNT(*) FROM position_comments')->fetchColumn());
    }

    public function test_book_game_ingest_on_a_read_only_database_reports_it(): void
    {
        $file = sys_get_temp_dir() . '/comments-ro-' . bin2hex(random_bytes(4)) . '.sqlite';
        self::database()->exec("VACUUM INTO '" . $file . "'");
        chmod($file, 0444);
        try {
            $store = new SqlitePositionCommentStore($file);
            $this->expectException(\App\Application\Comments\Port\CommentsReadOnly::class);
            $store->addBookGame(self::bookGame());
        } finally {
            chmod($file, 0644);
            @unlink($file);
        }
    }

    public function test_book_game_ingest_works_on_an_older_database_without_the_newer_columns(): void
    {
        $pdo = self::database(false);
        $res = (new SqlitePositionCommentStore('', $pdo))->addBookGame(self::bookGame());
        self::assertSame(2, $res['added']);
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\Comments;

use App\Application\Comments\Port\CommentsReadOnly;
use App\Application\Comments\Port\PositionCommentStore;

/**
 * Reads the commentary database built offline (storage/comments.sqlite).
 * Without the file there are simply no comments.
 */
final class SqlitePositionCommentStore implements PositionCommentStore
{
    private ?\PDO $pdo = null;

    /** @param ?\PDO $pdo an open database instead of the file (tests) */
    public function __construct(private readonly string $file, ?\PDO $pdo = null)
    {
        $this->pdo = $pdo;
    }

    public function forPosition(string $hash, string $key, int $limit): array
    {
        $pdo = $this->pdo();
        if ($pdo === null || !preg_match('/^[0-9a-f]{16}$/', $hash)) {
            return [];
        }
        $actions = $this->hasColumn('position_comments', 'actions') ? 'p.actions' : 'NULL';
        $st = $pdo->prepare(
            "SELECT p.id, p.text, p.lang, p.ply, p.san, {$actions} AS actions, g.id AS game_id, g.label, s.title, s.author, s.kind
             FROM position_comments p JOIN comment_games g ON g.id = p.game_id JOIN comment_sources s ON s.id = g.source_id
             WHERE p.hash = :hash AND p.position = :key AND p.san <> '" . self::INTRO_SAN . "'" . $this->visible('p', false) . ' ORDER BY s.priority, p.id LIMIT :limit'
        );
        $st->bindValue(':hash', $hash);
        $st->bindValue(':key', $key);
        $st->bindValue(':limit', max(1, min(20, $limit)), \PDO::PARAM_INT);
        $st->execute();
        return $this->withTranslations($pdo, array_map(fn(array $r) => [
            'id' => (int) $r['id'], 'text' => $r['text'], 'lang' => $r['lang'], 'ply' => (int) $r['ply'], 'san' => $r['san'],
            'game' => ['id' => $r['game_id'], 'label' => $r['label']],
            'source' => ['title' => $r['title'], 'author' => $r['author'], 'kind' => $r['kind']],
        ] + $this->actionsOf($r), $st->fetchAll(\PDO::FETCH_ASSOC)));
    }

    public function game(string $id): ?array
    {
        $pdo = $this->pdo();
        if ($pdo === null) {
            return null;
        }
        $st = $pdo->prepare('SELECT g.id, g.label, g.white, g.black, g.pgn, s.title, s.author, s.kind FROM comment_games g JOIN comment_sources s ON s.id = g.source_id WHERE g.id = :id');
        $st->execute([':id' => $id]);
        $r = $st->fetch(\PDO::FETCH_ASSOC);
        if (!$r) {
            return null;
        }
        $translations = [];
        if ($this->hasColumn('game_translations', 'pgn')) {
            $t = $pdo->prepare('SELECT lang, pgn FROM game_translations WHERE game_id = :id ORDER BY lang');
            $t->execute([':id' => $id]);
            foreach ($t->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $translations[(string) $row['lang']] = (string) $row['pgn'];
            }
        }
        return ['id' => $r['id'], 'label' => $r['label'], 'white' => $r['white'], 'black' => $r['black'], 'pgn' => $r['pgn'],
            'translations' => $translations,
            'source' => ['title' => $r['title'], 'author' => $r['author'], 'kind' => $r['kind']]];
    }

    public const MAX_PAGE = 200;

    public function list(array $filters, int $offset, int $limit): array
    {
        $pdo = $this->pdo();
        if ($pdo === null) {
            return ['total' => 0, 'comments' => []];
        }
        [$from, $params] = $this->filtered($filters);
        $count = $pdo->prepare("SELECT COUNT(*) {$from}");
        $count->execute($params);
        $total = (int) $count->fetchColumn();

        // Columns of newer builds; an older database lacks them.
        $move = $this->hasColumn('position_comments', 'move_number') ? 'p.move_number' : '(p.ply + 1) / 2';
        $chapter = $this->hasColumn('position_comments', 'chapter') ? 'p.chapter' : 'NULL';
        $book = $this->hasColumn('comment_sources', 'book_id') ? 's.book_id' : 'NULL';
        $actions = $this->hasColumn('position_comments', 'actions') ? 'p.actions' : 'NULL';
        $st = $pdo->prepare(
            "SELECT p.id, p.hash, p.position, p.text, p.lang, p.ply, {$move} AS move_number, p.san, p.game_id, {$chapter} AS chapter, {$actions} AS actions,
                    s.id AS source_id, s.title, s.author, s.kind, s.lang AS source_lang, {$book} AS book_id, g.white, g.black, g.label
             {$from} ORDER BY p.id LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $k => $v) {
            $st->bindValue($k, $v, is_int($v) ? \PDO::PARAM_INT : \PDO::PARAM_STR);
        }
        $st->bindValue(':limit', max(1, min(self::MAX_PAGE, $limit)), \PDO::PARAM_INT);
        $st->bindValue(':offset', max(0, $offset), \PDO::PARAM_INT);
        $st->execute();
        $comments = array_map(fn(array $r) => [
            'id' => (int) $r['id'], 'hash' => $r['hash'], 'fen' => $r['position'] . ' 0 1', 'text' => $r['text'], 'lang' => $r['lang'],
            'ply' => (int) $r['ply'], 'move_number' => $r['move_number'] === null ? (int) ceil($r['ply'] / 2) : (int) $r['move_number'],
            'san' => $r['san'], 'game_id' => $r['game_id'], 'chapter' => $r['chapter'] === null ? null : (int) $r['chapter'],
            'source' => ['id' => (int) $r['source_id'], 'title' => $r['title'], 'author' => $r['author'], 'kind' => $r['kind'], 'lang' => $r['source_lang'], 'book' => $r['book_id']],
            'game' => ['white' => $r['white'], 'black' => $r['black'], 'label' => $r['label']],
        ] + $this->actionsOf($r), $st->fetchAll(\PDO::FETCH_ASSOC));
        return ['total' => $total, 'comments' => $this->withTranslations($pdo, $comments)];
    }

    /**
     * The FROM/WHERE shared by the list and the ranking, and its parameters.
     *
     * @param array<string, mixed> $filters
     * @return array{string, array<string, mixed>}
     */
    private function filtered(array $filters): array
    {
        $where = [];
        $params = [];
        if (($filters['q'] ?? '') !== '') {
            $where[] = "p.text LIKE :q ESCAPE '\\'";
            $params[':q'] = '%' . strtr((string) $filters['q'], ['\\' => '\\\\', '%' => '\\%', '_' => '\\_']) . '%';
        }
        if (isset($filters['source'])) {
            $where[] = 's.id = :source';
            $params[':source'] = (int) $filters['source'];
        }
        if (($filters['lang'] ?? '') !== '') {
            $where[] = 'p.lang = :lang';
            $params[':lang'] = (string) $filters['lang'];
        }
        if (($filters['kind'] ?? '') !== '') {
            $where[] = 's.kind = :kind';
            $params[':kind'] = (string) $filters['kind'];
        }
        if ($filters['noIntro'] ?? false) {
            $where[] = "p.san <> '" . self::INTRO_SAN . "'";
        }
        if ($this->hasColumn('position_comments', 'hidden_at')) {
            $where[] = ($filters['hidden'] ?? false) ? 'p.hidden_at IS NOT NULL' : 'p.hidden_at IS NULL';
        } elseif ($filters['hidden'] ?? false) {
            $where[] = '0';
        }
        $from = 'FROM position_comments p JOIN comment_games g ON g.id = p.game_id JOIN comment_sources s ON s.id = g.source_id'
            . ($where ? ' WHERE ' . implode(' AND ', $where) : '');
        return [$from, $params];
    }

    public const MAX_TOP = 100;

    public function top(array $filters, int $limit): array
    {
        $pdo = $this->pdo();
        if ($pdo === null) {
            return [];
        }
        [$from, $params] = $this->filtered(['hidden' => false, 'noIntro' => true] + $filters + []);
        $params2 = $params;
        $bind = static function (\PDOStatement $st, array $p): void {
            foreach ($p as $k => $v) {
                $st->bindValue($k, $v, is_int($v) ? \PDO::PARAM_INT : \PDO::PARAM_STR);
            }
        };
        // A position is its hash and key (FEN without move counters), as the lookups use them.
        $st = $pdo->prepare("SELECT p.hash, p.position, COUNT(*) AS n {$from} GROUP BY p.hash, p.position ORDER BY n DESC, p.hash, p.position LIMIT :limit");
        $bind($st, $params);
        $st->bindValue(':limit', max(1, min(self::MAX_TOP, $limit)), \PDO::PARAM_INT);
        $st->execute();
        $ranked = $st->fetchAll(\PDO::FETCH_ASSOC);
        if ($ranked === []) {
            return [];
        }
        $hashes = array_values(array_unique(array_column($ranked, 'hash')));
        $in = '(' . implode(',', array_map(static fn(int $i): string => ":h{$i}", array_keys($hashes))) . ')';
        $hashParams = [];
        foreach ($hashes as $i => $h) {
            $hashParams[":h{$i}"] = $h;
        }
        $glue = str_contains($from, ' WHERE ') ? ' AND ' : ' WHERE ';
        $book = $this->hasColumn('comment_sources', 'book_id') ? 's.book_id' : 'NULL';
        $move = $this->hasColumn('position_comments', 'move_number') ? 'p.move_number' : '(p.ply + 1) / 2';

        $src = $pdo->prepare("SELECT p.hash, p.position, s.id, s.title, s.author, {$book} AS book_id, s.kind, s.lang, COUNT(*) AS n {$from}{$glue}p.hash IN {$in}
            GROUP BY p.hash, p.position, s.id ORDER BY n DESC, s.priority, s.id");
        $bind($src, $params2 + $hashParams);
        $src->execute();
        $sources = [];
        foreach ($src->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $sources[$r['hash'] . "\0" . $r['position']][] = ['id' => (int) $r['id'], 'title' => $r['title'], 'author' => $r['author'], 'book' => $r['book_id'],
                'kind' => $r['kind'], 'lang' => $r['lang'], 'count' => (int) $r['n']];
        }
        $smp = $pdo->prepare("SELECT * FROM (SELECT p.hash, p.position, p.id, p.ply, {$move} AS move, p.san, p.text,
                ROW_NUMBER() OVER (PARTITION BY p.hash, p.position ORDER BY s.priority, p.id) AS rn {$from}{$glue}p.hash IN {$in}) WHERE rn <= 3 ORDER BY hash, position, rn");
        $bind($smp, $params2 + $hashParams);
        $smp->execute();
        $samples = [];
        foreach ($smp->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $samples[$r['hash'] . "\0" . $r['position']][] = ['id' => (int) $r['id'], 'ply' => (int) $r['ply'], 'move' => (int) $r['move'], 'san' => $r['san'], 'text' => mb_substr((string) $r['text'], 0, 240)];
        }
        return array_map(static function (array $r) use ($sources, $samples): array {
            $key = $r['hash'] . "\0" . $r['position'];
            return ['hash' => $r['hash'], 'fen' => $r['position'] . ' 0 1', 'count' => (int) $r['n'],
                'sources' => array_slice($sources[$key] ?? [], 0, 6), 'samples' => $samples[$key] ?? []];
        }, $ranked);
    }

    /**
     * Adds `translations` (language => text; the universal text sits under the comment's own language)
     * to the comments that have some.
     *
     * @param list<array<string, mixed>> $comments
     * @return list<array<string, mixed>>
     */
    private function withTranslations(\PDO $pdo, array $comments): array
    {
        if ($comments === [] || !$this->hasColumn('comment_translations', 'text')) {
            return $comments;
        }
        $ids = array_map(static fn(array $c): int => (int) $c['id'], $comments);
        $st = $pdo->prepare('SELECT comment_id, lang, text FROM comment_translations WHERE comment_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
        $st->execute($ids);
        $byId = [];
        foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $byId[(int) $r['comment_id']][(string) $r['lang']] = (string) $r['text'];
        }
        return array_map(static fn(array $c): array => isset($byId[$c['id']]) ? $c + ['translations' => $byId[$c['id']]] : $c, $comments);
    }

    public function sources(): array
    {
        $pdo = $this->pdo();
        if ($pdo === null) {
            return [];
        }
        $book = $this->hasColumn('comment_sources', 'book_id') ? 's.book_id' : 'NULL';
        $rows = $pdo->query(
            "SELECT s.id, s.title, s.author, s.kind, s.lang, {$book} AS book_id,
                    (SELECT COUNT(*) FROM position_comments p JOIN comment_games g ON g.id = p.game_id WHERE g.source_id = s.id" . $this->visible('p', false) . ") AS comments
             FROM comment_sources s ORDER BY s.priority, s.id"
        )->fetchAll(\PDO::FETCH_ASSOC);
        return array_map(fn(array $r) => [
            'id' => (int) $r['id'], 'title' => $r['title'], 'author' => $r['author'], 'kind' => $r['kind'], 'lang' => $r['lang'],
            'book' => $r['book_id'], 'comments' => (int) $r['comments'],
        ], $rows);
    }

    /** SQL to append to a WHERE: hides the hidden comments (nothing when the database has no hidden_at yet). */
    private function visible(string $alias, bool $first): string
    {
        if (!$this->hasColumn('position_comments', 'hidden_at')) {
            return '';
        }
        return ($first ? ' WHERE ' : ' AND ') . "{$alias}.hidden_at IS NULL";
    }

    public function hide(int $id): bool
    {
        return $this->setHidden($id, true);
    }

    public function restore(int $id): bool
    {
        return $this->setHidden($id, false);
    }

    public function setTranslation(int $id, string $lang, string $text): bool
    {
        $pdo = $this->pdo();
        if ($pdo === null) {
            return false;
        }
        try {
            $pdo->exec('CREATE TABLE IF NOT EXISTS comment_translations (comment_id INTEGER NOT NULL, lang TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY (comment_id, lang))');
            $exists = $pdo->prepare('SELECT 1 FROM position_comments WHERE id = :id');
            $exists->execute([':id' => $id]);
            if (!$exists->fetchColumn()) {
                return false;
            }
            $pdo->prepare('INSERT INTO comment_translations (comment_id, lang, text) VALUES (:id, :lang, :text) ON CONFLICT (comment_id, lang) DO UPDATE SET text = excluded.text')
                ->execute([':id' => $id, ':lang' => $lang, ':text' => $text]);
            $this->columns = [];
            return true;
        } catch (\PDOException $e) {
            $m = strtolower($e->getMessage());
            if (str_contains($m, 'readonly') || str_contains($m, 'read-only') || str_contains($m, 'unable to open')) {
                throw new CommentsReadOnly('The comments database is read-only', 0, $e);
            }
            throw $e;
        }
    }

    /** `actions` of a comment row, only when it has some (the key is absent otherwise). @param array<string, mixed> $row @return array<string, string> */
    private function actionsOf(array $row): array
    {
        $a = $row['actions'] ?? null;
        return is_string($a) && $a !== '' ? ['actions' => $a] : [];
    }

    public function setActions(int $id, string $actions): bool
    {
        $pdo = $this->pdo();
        if ($pdo === null) {
            return false;
        }
        try {
            $exists = $pdo->prepare('SELECT 1 FROM position_comments WHERE id = :id');
            $exists->execute([':id' => $id]);
            if (!$exists->fetchColumn()) {
                return false;
            }
            if (!$this->hasColumn('position_comments', 'actions')) {
                $pdo->exec('ALTER TABLE position_comments ADD COLUMN actions TEXT');
                $this->columns = [];
            }
            $pdo->prepare('UPDATE position_comments SET actions = :actions WHERE id = :id')
                ->execute([':actions' => $actions === '' ? null : $actions, ':id' => $id]);
            return true;
        } catch (\PDOException $e) {
            throw $this->readOnlyOr($e);
        }
    }

    private const GAME_TRANSLATIONS_DDL = 'CREATE TABLE IF NOT EXISTS game_translations (game_id TEXT NOT NULL, lang TEXT NOT NULL, pgn TEXT NOT NULL, PRIMARY KEY (game_id, lang))';
    private const GAME_TRANSLATION_UPSERT = 'INSERT INTO game_translations (game_id, lang, pgn) VALUES (:id, :lang, :pgn) ON CONFLICT (game_id, lang) DO UPDATE SET pgn = excluded.pgn';

    public function setGameTranslation(string $gameId, string $lang, string $pgn): bool
    {
        $pdo = $this->pdo();
        if ($pdo === null) {
            return false;
        }
        try {
            $pdo->exec(self::GAME_TRANSLATIONS_DDL);
            $exists = $pdo->prepare('SELECT 1 FROM comment_games WHERE id = :id');
            $exists->execute([':id' => $gameId]);
            if (!$exists->fetchColumn()) {
                return false;
            }
            $pdo->prepare(self::GAME_TRANSLATION_UPSERT)->execute([':id' => $gameId, ':lang' => $lang, ':pgn' => $pgn]);
            $this->columns = [];
            return true;
        } catch (\PDOException $e) {
            throw $this->readOnlyOr($e);
        }
    }

    public function addBookGame(array $data): array
    {
        $pdo = $this->pdo();
        if ($pdo === null) {
            throw new CommentsReadOnly('The comments database is not available');
        }
        $book = $data['book'];
        $game = $data['game'];
        $chapter = $data['chapter'];
        try {
            $pdo->beginTransaction();
            try {
                $this->ensureCommentTables($pdo);
                $sourceId = $this->bookSource($pdo, $book);
                $gameId = 'b' . substr(sha1($book['title'] . '|' . $chapter . '|' . $game['pgn']), 0, 12);
                $pdo->prepare('INSERT OR IGNORE INTO comment_games (id, source_id, white, black, label, pgn) VALUES (:id, :source, :white, :black, :label, :pgn)')
                    ->execute([':id' => $gameId, ':source' => $sourceId, ':white' => $game['white'] ?? null, ':black' => $game['black'] ?? null,
                        ':label' => $game['label'] ?? null, ':pgn' => $game['pgn']]);

                $withMove = $this->hasColumn('position_comments', 'move_number');
                $withChapter = $this->hasColumn('position_comments', 'chapter');
                $find = $pdo->prepare('SELECT id FROM position_comments WHERE game_id = :game AND hash = :hash AND text = :text');
                $cols = ['hash', 'position', 'game_id', 'ply', 'san', 'lang', 'text'] + ($withMove ? [7 => 'move_number'] : []) + ($withChapter ? [8 => 'chapter'] : []);
                $insert = $pdo->prepare('INSERT INTO position_comments (' . implode(', ', $cols) . ') VALUES (:' . implode(', :', $cols) . ')');
                $added = 0;
                $ids = [];
                foreach ($game['comments'] as $i => $c) {
                    $find->execute([':game' => $gameId, ':hash' => $c['hash'], ':text' => $c['text']]);
                    $id = $find->fetchColumn();
                    if ($id === false) {
                        $params = [':hash' => $c['hash'], ':position' => $c['key'], ':game_id' => $gameId, ':ply' => $c['ply'], ':san' => $c['san'],
                            ':lang' => $book['lang'], ':text' => $c['text']];
                        if ($withMove) {
                            $params[':move_number'] = $c['move'];
                        }
                        if ($withChapter) {
                            $params[':chapter'] = $chapter;
                        }
                        $insert->execute($params);
                        $id = $pdo->lastInsertId();
                        $added++;
                    }
                    $ids[$i] = (int) $id;
                }

                $translated = 0;
                $upsert = $pdo->prepare('INSERT INTO comment_translations (comment_id, lang, text) VALUES (:id, :lang, :text) ON CONFLICT (comment_id, lang) DO UPDATE SET text = excluded.text');
                foreach ($game['translations'] ?? [] as $lang => $t) {
                    if (isset($t['pgn'])) {
                        $pdo->prepare(self::GAME_TRANSLATION_UPSERT)->execute([':id' => $gameId, ':lang' => (string) $lang, ':pgn' => $t['pgn']]);
                    }
                    foreach ($t['comments'] ?? [] as $i => $text) {
                        if ($text !== '' && isset($ids[$i])) {
                            $upsert->execute([':id' => $ids[$i], ':lang' => (string) $lang, ':text' => $text]);
                            $translated++;
                        }
                    }
                }
                $pdo->commit();
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        } catch (\PDOException $e) {
            throw $this->readOnlyOr($e);
        } finally {
            $this->columns = [];
        }
        return ['gameId' => $gameId, 'sourceId' => $sourceId, 'added' => $added, 'translated' => $translated];
    }

    /** Creates the tables of the commentary database that a fresh file lacks (the build script's schema). */
    private function ensureCommentTables(\PDO $pdo): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS comment_sources (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, author TEXT, lang TEXT NOT NULL, priority INTEGER NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS comment_games (id TEXT PRIMARY KEY, source_id INTEGER NOT NULL REFERENCES comment_sources(id), white TEXT, black TEXT, label TEXT, pgn TEXT NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS position_comments (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, position TEXT NOT NULL, game_id TEXT NOT NULL REFERENCES comment_games(id), ply INTEGER NOT NULL, san TEXT NOT NULL, lang TEXT NOT NULL, text TEXT NOT NULL)');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_position_comments_hash ON position_comments(hash)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS comment_translations (comment_id INTEGER NOT NULL REFERENCES position_comments(id), lang TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY (comment_id, lang))');
        $pdo->exec(self::GAME_TRANSLATIONS_DDL);
        $this->columns = [];
    }

    /** The id of the book source with this title, created (at the highest book priority in use, or 1) when absent. */
    private function bookSource(\PDO $pdo, array $book): int
    {
        $st = $pdo->prepare("SELECT id FROM comment_sources WHERE kind = 'book' AND title = :title ORDER BY id LIMIT 1");
        $st->execute([':title' => $book['title']]);
        $id = $st->fetchColumn();
        if ($id !== false) {
            return (int) $id;
        }
        $priority = (int) ($pdo->query("SELECT MAX(priority) FROM comment_sources WHERE kind = 'book'")->fetchColumn() ?: 1);
        $pdo->prepare("INSERT INTO comment_sources (kind, title, author, lang, priority) VALUES ('book', :title, :author, :lang, :priority)")
            ->execute([':title' => $book['title'], ':author' => $book['author'] ?? null, ':lang' => $book['lang'], ':priority' => $priority]);
        return (int) $pdo->lastInsertId();
    }

    private function readOnlyOr(\PDOException $e): \Throwable
    {
        $m = strtolower($e->getMessage());
        if (str_contains($m, 'readonly') || str_contains($m, 'read-only') || str_contains($m, 'unable to open')) {
            return new CommentsReadOnly('The comments database is read-only', 0, $e);
        }
        return $e;
    }

    /** Hides or restores one comment; its row and translations stay. The tombstone keeps "hidden" across rebuilds. */
    private function setHidden(int $id, bool $hide): bool
    {
        $pdo = $this->pdo();
        if ($pdo === null) {
            return false;
        }
        try {
            $pdo->exec(
                'CREATE TABLE IF NOT EXISTS comment_tombstones (position_hash TEXT NOT NULL, text_hash TEXT NOT NULL,
                 deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (position_hash, text_hash))'
            );
            if (!$this->hasColumn('position_comments', 'hidden_at')) {
                $pdo->exec('ALTER TABLE position_comments ADD COLUMN hidden_at TEXT');
                $this->columns = [];
            }
            $pdo->beginTransaction();
            try {
                $st = $pdo->prepare('SELECT hash, text FROM position_comments WHERE id = :id');
                $st->execute([':id' => $id]);
                $row = $st->fetch(\PDO::FETCH_ASSOC);
                if (!$row) {
                    $pdo->rollBack();
                    return false;
                }
                $keys = [':h' => $row['hash'], ':t' => hash('sha256', (string) $row['text'])];
                if ($hide) {
                    $pdo->prepare('UPDATE position_comments SET hidden_at = COALESCE(hidden_at, CURRENT_TIMESTAMP) WHERE id = :id')->execute([':id' => $id]);
                    $pdo->prepare('INSERT OR IGNORE INTO comment_tombstones (position_hash, text_hash) VALUES (:h, :t)')->execute($keys);
                } else {
                    $pdo->prepare('UPDATE position_comments SET hidden_at = NULL WHERE id = :id')->execute([':id' => $id]);
                    $pdo->prepare('DELETE FROM comment_tombstones WHERE position_hash = :h AND text_hash = :t')->execute($keys);
                }
                $pdo->commit();
                return true;
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        } catch (\PDOException $e) {
            $m = strtolower($e->getMessage());
            if (str_contains($m, 'readonly') || str_contains($m, 'read-only') || str_contains($m, 'unable to open')) {
                throw new CommentsReadOnly('The comments database is read-only', 0, $e);
            }
            throw $e;
        }
    }

    /** @var array<string, bool> */
    private array $columns = [];

    private function hasColumn(string $table, string $column): bool
    {
        $key = "{$table}.{$column}";
        if (!isset($this->columns[$key])) {
            $names = array_column($this->pdo()?->query("PRAGMA table_info({$table})")->fetchAll(\PDO::FETCH_ASSOC) ?? [], 'name');
            $this->columns[$key] = in_array($column, $names, true);
        }
        return $this->columns[$key];
    }

    private function pdo(): ?\PDO
    {
        if ($this->pdo === null && is_file($this->file)) {
            $this->pdo = new \PDO('sqlite:' . $this->file, null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
        }
        return $this->pdo;
    }
}

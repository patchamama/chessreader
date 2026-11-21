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
        $st = $pdo->prepare(
            'SELECT p.id, p.text, p.lang, p.ply, p.san, g.id AS game_id, g.label, s.title, s.author, s.kind
             FROM position_comments p JOIN comment_games g ON g.id = p.game_id JOIN comment_sources s ON s.id = g.source_id
             WHERE p.hash = :hash AND p.position = :key' . $this->visible('p', false) . ' ORDER BY s.priority, p.id LIMIT :limit'
        );
        $st->bindValue(':hash', $hash);
        $st->bindValue(':key', $key);
        $st->bindValue(':limit', max(1, min(20, $limit)), \PDO::PARAM_INT);
        $st->execute();
        return $this->withTranslations($pdo, array_map(fn(array $r) => [
            'id' => (int) $r['id'], 'text' => $r['text'], 'lang' => $r['lang'], 'ply' => (int) $r['ply'], 'san' => $r['san'],
            'game' => ['id' => $r['game_id'], 'label' => $r['label']],
            'source' => ['title' => $r['title'], 'author' => $r['author'], 'kind' => $r['kind']],
        ], $st->fetchAll(\PDO::FETCH_ASSOC)));
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
        return ['id' => $r['id'], 'label' => $r['label'], 'white' => $r['white'], 'black' => $r['black'], 'pgn' => $r['pgn'],
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
        $st = $pdo->prepare(
            "SELECT p.id, p.hash, p.position, p.text, p.lang, p.ply, {$move} AS move_number, p.san, p.game_id, {$chapter} AS chapter,
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
        ], $st->fetchAll(\PDO::FETCH_ASSOC));
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
        [$from, $params] = $this->filtered(['hidden' => false] + $filters + []);
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

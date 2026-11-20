<?php

declare(strict_types=1);

namespace App\Infrastructure\Comments;

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
             WHERE p.hash = :hash AND p.position = :key ORDER BY s.priority, p.id LIMIT :limit'
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
        $from = 'FROM position_comments p JOIN comment_games g ON g.id = p.game_id JOIN comment_sources s ON s.id = g.source_id'
            . ($where ? ' WHERE ' . implode(' AND ', $where) : '');
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
                    (SELECT COUNT(*) FROM position_comments p JOIN comment_games g ON g.id = p.game_id WHERE g.source_id = s.id) AS comments
             FROM comment_sources s ORDER BY s.priority, s.id"
        )->fetchAll(\PDO::FETCH_ASSOC);
        return array_map(fn(array $r) => [
            'id' => (int) $r['id'], 'title' => $r['title'], 'author' => $r['author'], 'kind' => $r['kind'], 'lang' => $r['lang'],
            'book' => $r['book_id'], 'comments' => (int) $r['comments'],
        ], $rows);
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

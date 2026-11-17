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

    public function __construct(private readonly string $file)
    {
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
        return array_map(fn(array $r) => [
            'id' => (int) $r['id'], 'text' => $r['text'], 'lang' => $r['lang'], 'ply' => (int) $r['ply'], 'san' => $r['san'],
            'game' => ['id' => $r['game_id'], 'label' => $r['label']],
            'source' => ['title' => $r['title'], 'author' => $r['author'], 'kind' => $r['kind']],
        ], $st->fetchAll(\PDO::FETCH_ASSOC));
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

    private function pdo(): ?\PDO
    {
        if ($this->pdo === null && is_file($this->file)) {
            $this->pdo = new \PDO('sqlite:' . $this->file, null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
        }
        return $this->pdo;
    }
}

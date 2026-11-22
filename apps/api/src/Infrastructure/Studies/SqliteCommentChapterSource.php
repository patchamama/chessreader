<?php

declare(strict_types=1);

namespace App\Infrastructure\Studies;

use App\Application\Studies\CommentChapterSource;

/** The Lichess chapters of the commentary database (storage/comments.sqlite), read-only. */
final class SqliteCommentChapterSource implements CommentChapterSource
{
    /** @param ?\PDO $pdo an open database instead of the file (tests) */
    public function __construct(private readonly string $file, private readonly ?\PDO $pdo = null)
    {
    }

    public function lichessChapterPgns(): iterable
    {
        $pdo = $this->pdo;
        if ($pdo === null) {
            if (!is_file($this->file)) {
                return [];
            }
            $pdo = new \PDO('sqlite:' . $this->file, null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
            $pdo->exec('PRAGMA query_only = 1');
        }
        try {
            $st = $pdo->query("SELECT g.pgn FROM comment_games g JOIN comment_sources s ON s.id = g.source_id WHERE s.kind = 'lichess' ORDER BY g.id");
        } catch (\PDOException) {
            return [];
        }
        return $st === false ? [] : array_map('strval', $st->fetchAll(\PDO::FETCH_COLUMN));
    }
}

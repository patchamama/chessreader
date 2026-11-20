<?php

declare(strict_types=1);

namespace App\Infrastructure\Suggestions;

use App\Application\Ingestion\Port\ChapterStore;
use Doctrine\DBAL\Connection;

/** Chapters in the `chapters` table (migration 002), rewritten in place by (book_id, ord). */
final class DbalChapterStore implements ChapterStore
{
    public function __construct(private readonly Connection $connection)
    {
    }

    public function replaceChapters(int $bookId, array $chapters): void
    {
        $this->connection->transactional(function (Connection $db) use ($bookId, $chapters): void {
            $existing = array_map('intval', $db->fetchFirstColumn('SELECT ord FROM chapters WHERE book_id = ?', [$bookId]));
            foreach (array_values($chapters) as $i => $chapter) {
                $ord = $i + 1;
                if (in_array($ord, $existing, true)) {
                    $db->update('chapters', ['title' => $chapter['title'], 'html' => $chapter['html']], ['book_id' => $bookId, 'ord' => $ord]);
                } else {
                    $db->insert('chapters', ['book_id' => $bookId, 'ord' => $ord, 'title' => $chapter['title'], 'html' => $chapter['html']]);
                }
            }
            $db->executeStatement('DELETE FROM chapters WHERE book_id = ? AND ord > ?', [$bookId, count($chapters)]);
        });
    }
}

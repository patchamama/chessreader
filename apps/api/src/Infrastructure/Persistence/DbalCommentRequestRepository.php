<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence;

use App\Domain\Library\CommentRequest;
use App\Domain\Library\CommentRequestRepository;
use Doctrine\DBAL\Connection;

final class DbalCommentRequestRepository implements CommentRequestRepository
{
    private const SELECT = 'SELECT r.id, r.book_id, r.status, r.note, r.created_at, r.requested_by, b.title, b.language
        FROM book_comment_requests r JOIN books b ON b.id = r.book_id';

    public function __construct(private readonly Connection $connection) {}

    public function findPendingByBook(int $bookId): ?CommentRequest
    {
        $row = $this->connection->fetchAssociative(self::SELECT . " WHERE r.book_id = ? AND r.status = 'pending'", [$bookId]);
        return $row ? $this->hydrate($row) : null;
    }

    public function findById(int $id): ?CommentRequest
    {
        $row = $this->connection->fetchAssociative(self::SELECT . ' WHERE r.id = ?', [$id]);
        return $row ? $this->hydrate($row) : null;
    }

    public function createPending(int $bookId, string $note, ?int $requestedBy): CommentRequest
    {
        $now = gmdate('Y-m-d H:i:s');
        $this->connection->insert('book_comment_requests', [
            'book_id'      => $bookId,
            'status'       => 'pending',
            'note'         => $note,
            'requested_by' => $requestedBy,
            'created_at'   => $now,
            'updated_at'   => $now,
        ]);
        return $this->findById((int) $this->connection->lastInsertId())
            ?? throw new \RuntimeException('Comment request not saved');
    }

    public function listByStatus(string $status): array
    {
        $rows = $this->connection->fetchAllAssociative(self::SELECT . ' WHERE r.status = ? ORDER BY r.created_at DESC, r.id DESC', [$status]);
        return array_map($this->hydrate(...), $rows);
    }

    public function setStatus(int $id, string $status): void
    {
        $this->connection->update('book_comment_requests', ['status' => $status, 'updated_at' => gmdate('Y-m-d H:i:s')], ['id' => $id]);
    }

    public function delete(int $id): void
    {
        $this->connection->delete('book_comment_requests', ['id' => $id]);
    }

    public function latestStatusByBook(array $bookIds): array
    {
        if ($bookIds === []) {
            return [];
        }
        $marks = implode(',', array_fill(0, count($bookIds), '?'));
        $rows  = $this->connection->fetchAllAssociative(
            "SELECT book_id, status FROM book_comment_requests WHERE book_id IN ($marks) ORDER BY id ASC",
            array_values($bookIds),
        );
        $out = [];
        foreach ($rows as $row) {
            $out[(int) $row['book_id']] = (string) $row['status'];   // later rows overwrite earlier ones
        }
        return $out;
    }

    /** @param array<string,mixed> $row */
    private function hydrate(array $row): CommentRequest
    {
        return new CommentRequest(
            (int) $row['id'],
            (int) $row['book_id'],
            (string) $row['title'],
            (string) ($row['language'] ?? ''),
            (string) $row['status'],
            (string) $row['note'],
            (string) $row['created_at'],
            $row['requested_by'] === null ? null : (int) $row['requested_by'],
        );
    }
}

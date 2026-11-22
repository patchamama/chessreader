<?php

declare(strict_types=1);

namespace App\Domain\Library;

interface CommentRequestRepository
{
    public function findPendingByBook(int $bookId): ?CommentRequest;

    public function findById(int $id): ?CommentRequest;

    /** Creates a pending request and returns it. */
    public function createPending(int $bookId, string $note, ?int $requestedBy): CommentRequest;

    /** @return CommentRequest[] newest first */
    public function listByStatus(string $status): array;

    public function setStatus(int $id, string $status): void;

    public function delete(int $id): void;

    /**
     * Status of the latest request of each book.
     *
     * @param int[] $bookIds
     * @return array<int,string> book id => status (books without requests are absent)
     */
    public function latestStatusByBook(array $bookIds): array;
}

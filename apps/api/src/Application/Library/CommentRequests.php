<?php

declare(strict_types=1);

namespace App\Application\Library;

use App\Domain\Library\BookRepository;
use App\Domain\Library\CommentRequest;
use App\Domain\Library\CommentRequestRepository;

/** Use cases around requests to add a book's comments to the commentary database. */
final class CommentRequests
{
    public function __construct(
        private readonly CommentRequestRepository $requests,
        private readonly BookRepository $books,
    ) {}

    /**
     * Idempotent: a book with a pending request gets that same request back.
     *
     * @return array{request:CommentRequest,created:bool}
     * @throws \InvalidArgumentException unknown book / note too long
     */
    public function request(int $bookId, string $note, int $userId): array
    {
        if (mb_strlen($note) > CommentRequest::MAX_NOTE_LENGTH) {
            throw new \DomainException('note must be at most ' . CommentRequest::MAX_NOTE_LENGTH . ' characters');
        }
        if ($this->books->findById($bookId) === null) {
            throw new \InvalidArgumentException('Book not found');
        }
        $pending = $this->requests->findPendingByBook($bookId);
        if ($pending !== null) {
            return ['request' => $pending, 'created' => false];
        }
        return ['request' => $this->requests->createPending($bookId, trim($note), $userId), 'created' => true];
    }

    /**
     * @throws \InvalidArgumentException no pending request
     * @throws \RuntimeException the user is neither the requester nor an admin
     */
    public function cancel(int $bookId, int $userId, bool $isAdmin): void
    {
        $pending = $this->requests->findPendingByBook($bookId)
            ?? throw new \InvalidArgumentException('No pending request');
        if (!$isAdmin && $pending->requestedBy !== $userId) {
            throw new \RuntimeException('Forbidden');
        }
        $this->requests->delete($pending->id);
    }

    /** @return CommentRequest[] */
    public function list(string $status): array
    {
        if (!in_array($status, CommentRequest::STATUSES, true)) {
            throw new \DomainException('status must be pending, done or rejected');
        }
        return $this->requests->listByStatus($status);
    }

    /**
     * @throws \DomainException invalid status
     * @throws \InvalidArgumentException unknown request, or setting pending when the book already has one
     */
    public function setStatus(int $id, string $status): CommentRequest
    {
        if (!in_array($status, CommentRequest::STATUSES, true)) {
            throw new \DomainException('status must be pending, done or rejected');
        }
        $current = $this->requests->findById($id) ?? throw new \InvalidArgumentException('Request not found');
        if ($status === 'pending' && $current->status !== 'pending' && $this->requests->findPendingByBook($current->bookId) !== null) {
            throw new \DomainException('The book already has a pending request');
        }
        $this->requests->setStatus($id, $status);
        return $this->requests->findById($id) ?? $current;
    }
}

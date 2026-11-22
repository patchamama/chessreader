<?php

declare(strict_types=1);

namespace App\Domain\Library;

/** A reader's request to add the comments of a book to the commentary database. */
final class CommentRequest
{
    public const STATUSES = ['pending', 'done', 'rejected'];
    public const MAX_NOTE_LENGTH = 500;

    public function __construct(
        public readonly int $id,
        public readonly int $bookId,
        public readonly string $bookTitle,
        public readonly string $language,
        public readonly string $status,
        public readonly string $note,
        public readonly string $createdAt,
        public readonly ?int $requestedBy,
    ) {}

    /** @return array{id:int,bookId:int,bookTitle:string,language:string,status:string,note:string,createdAt:string,requestedBy:?int} */
    public function toArray(): array
    {
        return [
            'id'          => $this->id,
            'bookId'      => $this->bookId,
            'bookTitle'   => $this->bookTitle,
            'language'    => $this->language,
            'status'      => $this->status,
            'note'        => $this->note,
            'createdAt'   => $this->createdAt,
            'requestedBy' => $this->requestedBy,
        ];
    }
}

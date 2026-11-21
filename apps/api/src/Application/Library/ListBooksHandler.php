<?php

declare(strict_types=1);

namespace App\Application\Library;

use App\Domain\Library\Book;
use App\Domain\Library\BookRepository;
use App\Infrastructure\Epub\BookLanguage;

final class ListBooksHandler
{
    public function __construct(
        private readonly BookRepository $books,
        /** Where the original EPUBs are kept; '' skips reading them when backfilling a language. */
        private readonly string $booksDir = '',
    ) {}

    /** @return array<array{id:int,title:string,author:string,createdAt:string,language:string}> */
    public function handle(int $ownerId): array
    {
        return array_map(
            fn(Book $b) => [
                'id'        => $b->id,
                'title'     => $b->title,
                'author'    => $b->author,
                'createdAt' => $b->createdAt,
                'language'  => $b->language !== '' ? $b->language : $this->backfillLanguage($b),
            ],
            $this->books->findReadyByOwner($ownerId),
        );
    }

    /** Computes the language of a book that has none yet, saves it and returns it ('' when unknown). */
    private function backfillLanguage(Book $book): string
    {
        try {
            $language = '';
            if ($this->booksDir !== '') {
                $language = BookLanguage::fromEpubFile(rtrim($this->booksDir, '/') . '/' . $book->id . '.epub');
            }
            if ($language === '') {
                $language = BookLanguage::resolve('', (function () use ($book) {
                    foreach (array_slice($this->books->findChaptersByBook($book->id), 0, 8) as $chapter) {
                        yield $chapter->html;
                    }
                })());
            }
            if ($language !== '') {
                $this->books->setLanguage($book->id, $language);
            }
            return $language;
        } catch (\Throwable) {
            return '';
        }
    }
}

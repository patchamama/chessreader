<?php

declare(strict_types=1);

namespace App\Tests\Unit\Domain\Library;

use App\Domain\Library\Book;
use App\Domain\Library\BookStatus;
use PHPUnit\Framework\TestCase;

class BookTest extends TestCase
{
    public function testDefaultDescriptionIsEmptyString(): void
    {
        $book = new Book(
            id:        1,
            ownerId:   2,
            title:     'Chess Fundamentals',
            author:    'Capablanca',
            status:    BookStatus::Ready,
            createdAt: '2024-01-01 00:00:00',
        );

        $this->assertSame('', $book->description);
    }

    public function testDescriptionCarriedThroughConstructorRoundTrip(): void
    {
        $book = new Book(
            id:          1,
            ownerId:     2,
            title:       'My Chess Book',
            author:      'Tal',
            status:      BookStatus::Ready,
            createdAt:   '2024-01-01 00:00:00',
            description: 'A legendary book about chess.',
        );

        $this->assertSame('A legendary book about chess.', $book->description);
    }
}

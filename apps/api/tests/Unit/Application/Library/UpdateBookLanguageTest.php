<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Library;

use App\Application\Library\UpdateBookCommand;
use App\Application\Library\UpdateBookHandler;
use App\Domain\Library\Book;
use App\Domain\Library\BookRepository;
use App\Domain\Library\BookStatus;
use PHPUnit\Framework\TestCase;

final class UpdateBookLanguageTest extends TestCase
{
    private function repo(): BookRepository&\PHPUnit\Framework\MockObject\MockObject
    {
        $repo = $this->createMock(BookRepository::class);
        $repo->method('findById')->willReturn(new Book(10, 2, 'T', 'A', BookStatus::Ready, '2024-01-01 00:00:00', 'd', 'en'));
        return $repo;
    }

    public function test_a_given_language_is_saved_and_returned(): void
    {
        $repo = $this->repo();
        $repo->expects(self::once())->method('setLanguage')->with(10, 'de');
        $book = (new UpdateBookHandler($repo))->handle(new UpdateBookCommand(10, 2, 'T', 'A', 'd', language: 'de'));
        self::assertSame('de', $book->language);
    }

    public function test_an_empty_language_clears_it(): void
    {
        $repo = $this->repo();
        $repo->expects(self::once())->method('setLanguage')->with(10, '');
        $book = (new UpdateBookHandler($repo))->handle(new UpdateBookCommand(10, 2, 'T', 'A', 'd', language: ''));
        self::assertSame('', $book->language);
    }

    public function test_an_omitted_language_keeps_the_current_one(): void
    {
        $repo = $this->repo();
        $repo->expects(self::never())->method('setLanguage');
        $book = (new UpdateBookHandler($repo))->handle(new UpdateBookCommand(10, 2, 'T', 'A', 'd'));
        self::assertSame('en', $book->language);
    }
}

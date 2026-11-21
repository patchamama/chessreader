<?php

declare(strict_types=1);

namespace App\Tests\Integration\Infrastructure;

use App\Domain\Library\Book;
use App\Domain\Library\BookStatus;
use App\Infrastructure\Persistence\DbalBookRepository;
use App\Tests\TestCase;

final class DbalBookRepositoryLanguageTest extends TestCase
{
    private DbalBookRepository $repo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repo = new DbalBookRepository($this->buildContainer()->get(\Doctrine\DBAL\Connection::class));
    }

    public function test_language_defaults_to_empty(): void
    {
        $id = $this->repo->save(new Book(0, 1, 'T', 'A', BookStatus::Ready, '2024-01-01 00:00:00'));
        self::assertSame('', $this->repo->findById($id)?->language);
    }

    public function test_language_is_saved_on_insert_and_can_be_set(): void
    {
        $id = $this->repo->save(new Book(0, 1, 'T', 'A', BookStatus::Ready, '2024-01-01 00:00:00', '', 'en'));
        self::assertSame('en', $this->repo->findById($id)?->language);

        $this->repo->setLanguage($id, 'es');
        self::assertSame('es', $this->repo->findById($id)?->language);
        self::assertSame('es', $this->repo->findReadyByOwner(1)[0]->language);
    }

    public function test_a_status_save_does_not_wipe_the_language(): void
    {
        $id = $this->repo->save(new Book(0, 1, 'T', 'A', BookStatus::Ready, '2024-01-01 00:00:00', '', 'fr'));
        $this->repo->save(new Book($id, 1, 'T2', 'A', BookStatus::Ready, '2024-01-01 00:00:00'));
        self::assertSame('fr', $this->repo->findById($id)?->language);
    }
}

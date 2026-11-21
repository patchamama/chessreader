<?php

declare(strict_types=1);

namespace App\Tests\Unit\Presentation\Suggestions;

use App\Application\Ingestion\Port\ChapterStore;
use App\Application\Ingestion\ReingestEpubChapters;
use App\Application\Suggestions\ApplySuggestionsToEpub;
use App\Application\Suggestions\RestoreEpubBackup;
use App\Domain\Library\Book;
use App\Domain\Library\BookRepository;
use App\Domain\Library\BookStatus;
use App\Domain\Library\Chapter;
use App\Infrastructure\Epub\EpubSuggestionEditor;
use App\Infrastructure\Epub\EpubWriter;
use App\Infrastructure\Epub\StoredEpubs;
use App\Infrastructure\Suggestions\DbalSuggestionRepository;
use App\Infrastructure\Suggestions\FilesystemSuggestionAssetStore;
use App\Presentation\Suggestions\BookEpubController;
use App\Tests\Unit\Infrastructure\Epub\SuggestionEpubFixture as F;
use App\Tests\Unit\Infrastructure\Suggestions\DbalSuggestionRepositoryTest;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

final class BookEpubControllerTest extends TestCase
{
    private string $dir;
    private DbalSuggestionRepository $repo;
    private BookEpubController $controller;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/book-epub-controller-' . bin2hex(random_bytes(4));
        mkdir($this->dir . '/books', 0777, true);
        rename(F::zip(), $this->dir . '/books/5.epub');
        $this->repo = new DbalSuggestionRepository(DbalSuggestionRepositoryTest::migratedConnection());
        $books = new class implements BookRepository {
            public function findReadyByOwner(int $ownerId): array { return []; }
            public function findById(int $id): ?Book
            {
                return $id === 5 ? new Book(5, 7, 'Placeholder Book: Second Edition', 'A', BookStatus::Ready, '2026-01-01') : null;
            }
            public function findByOwner(int $ownerId): array { return []; }
            public function update(int $id, string $title, string $author, string $description): void {}
            public function delete(int $id): void {}
            public function setLanguage(int $id, string $language): void {}
            public function save(Book $book): int { return $book->id; }
            public function saveChapter(int $bookId, int $order, string $title, string $html): int { return 0; }
            public function findChaptersByBook(int $bookId): array { return []; }
            public function findChapter(int $bookId, int $order): ?Chapter { return null; }
        };
        $epubs = new StoredEpubs($this->dir . '/books');
        $reingest = new ReingestEpubChapters(new class implements ChapterStore {
            public function replaceChapters(int $bookId, array $chapters): void {}
        });
        $this->controller = new BookEpubController(
            new ApplySuggestionsToEpub($books, $this->repo, $epubs, new EpubSuggestionEditor(new FilesystemSuggestionAssetStore($this->dir . '/assets')), new EpubWriter(), $reingest),
            new RestoreEpubBackup($books, $this->repo, $epubs, $reingest),
            $epubs,
            $books,
        );
    }

    protected function tearDown(): void
    {
        exec('rm -rf ' . escapeshellarg($this->dir));
    }

    private function request(string $method, string $body = '', string $role = 'user', int $sub = 7): ServerRequestInterface
    {
        return (new ServerRequestFactory())->createServerRequest($method, '/x')
            ->withBody((new StreamFactory())->createStream($body))
            ->withAttribute('auth_user', (object) ['sub' => $sub, 'role' => $role, 'status' => 'approved']);
    }

    private static function body(ResponseInterface $r): array
    {
        return (array) json_decode((string) $r->getBody(), true);
    }

    private function acceptText(): void
    {
        $s = F::suggestion('t1', 'text', ['chapter' => 1, 'anchor' => ['chapter' => 1, 'blockIndex' => 1, 'quote' => mb_substr(F::C1_P1, 0, 40)]], 'Corrected.');
        $s['target']['book'] = 'Placeholder Book: Second Edition';
        $this->repo->create($s, 7);
        $this->repo->setStatus('t1', 'accepted');
    }

    public function test_only_an_admin_applies_lists_or_restores(): void
    {
        $this->acceptText();
        $original = hash_file('sha256', $this->dir . '/books/5.epub');
        $r = new ResponseFactory();
        self::assertSame(403, $this->controller->applySuggestions($this->request('POST'), $r->createResponse(), 5)->getStatusCode());
        self::assertSame(403, $this->controller->backups($this->request('GET'), $r->createResponse(), 5)->getStatusCode());
        self::assertSame(403, $this->controller->restoreBackup($this->request('POST', '{"backup":"5-20260101T000000Z.epub"}'), $r->createResponse(), 5)->getStatusCode());
        self::assertSame($original, hash_file('sha256', $this->dir . '/books/5.epub'));
        self::assertSame('accepted', $this->repo->get('t1')['status']);
    }

    public function test_an_admin_applies_then_lists_and_restores_the_backup(): void
    {
        $this->acceptText();
        $original = hash_file('sha256', $this->dir . '/books/5.epub');
        $r = new ResponseFactory();

        $applied = $this->controller->applySuggestions($this->request('POST', '', 'admin'), $r->createResponse(), 5);
        self::assertSame(200, $applied->getStatusCode());
        $body = self::body($applied);
        self::assertSame(['t1'], $body['applied']);
        self::assertNotSame($original, hash_file('sha256', $this->dir . '/books/5.epub'));

        $list = self::body($this->controller->backups($this->request('GET', '', 'admin'), $r->createResponse(), 5));
        self::assertSame([$body['backup']], array_column($list['backups'], 'name'));

        $restored = $this->controller->restoreBackup($this->request('POST', json_encode(['backup' => $body['backup']]), 'admin'), $r->createResponse(), 5);
        self::assertSame(200, $restored->getStatusCode());
        self::assertSame($original, hash_file('sha256', $this->dir . '/books/5.epub'));
    }

    public function test_restore_refuses_a_traversal_name(): void
    {
        $r = new ResponseFactory();
        $res = $this->controller->restoreBackup($this->request('POST', '{"backup":"../../5.epub"}', 'admin'), $r->createResponse(), 5);
        self::assertSame(422, $res->getStatusCode());
        $res = $this->controller->restoreBackup($this->request('POST', '{}', 'admin'), $r->createResponse(), 5);
        self::assertSame(422, $res->getStatusCode());
    }

    public function test_apply_on_an_unknown_book_is_404(): void
    {
        $res = $this->controller->applySuggestions($this->request('POST', '', 'admin'), (new ResponseFactory())->createResponse(), 99);
        self::assertSame(404, $res->getStatusCode());
    }

    public function test_the_owner_or_an_admin_downloads_the_epub_as_an_attachment(): void
    {
        $r = new ResponseFactory();
        $res = $this->controller->download($this->request('GET', '', 'user', 7), $r->createResponse(), 5);
        self::assertSame(200, $res->getStatusCode());
        self::assertSame('application/epub+zip', $res->getHeaderLine('Content-Type'));
        self::assertSame('attachment; filename="placeholder-book-second-edition.epub"', $res->getHeaderLine('Content-Disposition'));
        self::assertSame(file_get_contents($this->dir . '/books/5.epub'), (string) $res->getBody());

        self::assertSame(200, $this->controller->download($this->request('GET', '', 'admin', 1), $r->createResponse(), 5)->getStatusCode());
        self::assertSame(403, $this->controller->download($this->request('GET', '', 'user', 8), $r->createResponse(), 5)->getStatusCode());
        self::assertSame(404, $this->controller->download($this->request('GET', '', 'admin', 1), $r->createResponse(), 6)->getStatusCode());
    }

    public function test_lists_the_book_images_marking_the_cover(): void
    {
        $res = $this->controller->images($this->request('GET'), (new ResponseFactory())->createResponse(), 5);
        self::assertSame(200, $res->getStatusCode());
        self::assertSame([
            ['path' => 'OEBPS/Images/d1.png', 'url' => '/api/library/books/5/images/OEBPS/Images/d1.png', 'cover' => false],
            ['path' => 'OEBPS/Images/cover.jpg', 'url' => '/api/library/books/5/images/OEBPS/Images/cover.jpg', 'cover' => true],
        ], self::body($res)['images']);
    }
}

<?php

declare(strict_types=1);

namespace App\Tests\Functional\Studies;

use App\Application\Auth\Port\PasswordHasher;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Tests\TestCase;
use App\Tests\Unit\Infrastructure\Epub\StudyEpubBuilderTest;
use Slim\Psr7\Factory\ServerRequestFactory;

final class StudyBookControllerTest extends TestCase
{
    private function post(\Slim\App $app, ?string $token, string $json)
    {
        $req = (new ServerRequestFactory())->createServerRequest('POST', '/api/studies/to-book')
            ->withHeader('Content-Type', 'application/json');
        if ($token !== null) {
            $req = $req->withHeader('Authorization', 'Bearer ' . $token);
        }
        $req->getBody()->write($json);
        $req->getBody()->rewind();
        return $app->handle($req);
    }

    private function token(\Slim\App $app): string
    {
        $c = $app->getContainer();
        $repo = $c->get(UserRepository::class);
        $repo->save(new User(new UserId(0), 'sb@test.com', $c->get(PasswordHasher::class)->hash('pw'), Role::User, RegistrationStatus::Approved, new \DateTimeImmutable()));
        return (new JwtTokenIssuer($c->get('settings')['jwt']['secret']))->issue($repo->findByEmail('sb@test.com'));
    }

    public function test_requires_a_session(): void
    {
        $app = $this->createApp();
        self::assertSame(401, $this->post($app, null, '{}')->getStatusCode());
    }

    public function test_the_study_book_appears_in_the_library_with_its_metadata(): void
    {
        $app = $this->createApp();
        $token = $this->token($app);
        $res = $this->post($app, $token, (string) json_encode(StudyEpubBuilderTest::book()));
        self::assertSame(201, $res->getStatusCode());
        $id = json_decode((string) $res->getBody(), true)['bookId'];

        $list = $app->handle((new ServerRequestFactory())->createServerRequest('GET', '/api/library/books')
            ->withHeader('Authorization', 'Bearer ' . $token));
        $books = json_decode((string) $list->getBody(), true);
        $mine = array_values(array_filter($books, fn ($b) => $b['id'] === $id))[0];
        self::assertSame('Invented Study', $mine['title']);
        self::assertSame('Ada <Test>', $mine['author']);
        self::assertSame('es', $mine['language']);

        // The stored EPUB (the test books folder) declares the cover the library route serves.
        $zip = new \ZipArchive();
        $zip->open(sys_get_temp_dir() . "/chessreader-test-books/{$id}.epub");
        self::assertSame('OEBPS/Images/cover.svg', \App\Infrastructure\Epub\EpubPackage::fromZip($zip)->coverPath());
        $chapter = $app->handle((new ServerRequestFactory())->createServerRequest('GET', "/api/library/books/{$id}/chapters/1")
            ->withHeader('Authorization', 'Bearer ' . $token));
        self::assertStringContainsString('First &amp; best', (string) $chapter->getBody());
    }

    public function test_an_invalid_book_answers_422_and_adds_nothing(): void
    {
        $app = $this->createApp();
        $token = $this->token($app);
        $bad = StudyEpubBuilderTest::book();
        $bad['chapters'] = [];
        self::assertSame(422, $this->post($app, $token, (string) json_encode($bad))->getStatusCode());
        self::assertSame(400, $this->post($app, $token, 'not json')->getStatusCode());
        $list = $app->handle((new ServerRequestFactory())->createServerRequest('GET', '/api/library/books')
            ->withHeader('Authorization', 'Bearer ' . $token));
        self::assertSame([], json_decode((string) $list->getBody(), true));
    }
}

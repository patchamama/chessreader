<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Application\Auth\Port\PasswordHasher;
use App\Domain\Auth\RegistrationStatus;
use App\Domain\Auth\Role;
use App\Domain\Auth\User;
use App\Domain\Auth\UserId;
use App\Domain\Auth\UserRepository;
use App\Infrastructure\Auth\JwtTokenIssuer;
use App\Infrastructure\Errata\FilesystemErrataRepository;
use App\Presentation\Errata\ErrataController;
use App\Tests\TestCase;
use App\Tests\Unit\Errata\ErrataEntryValidatorTest;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class ErrataControllerTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/errata-api-' . bin2hex(random_bytes(4));
    }

    protected function tearDown(): void
    {
        if (is_dir($this->dir)) {
            exec('rm -rf ' . escapeshellarg($this->dir));
        }
    }

    /** @return array{0: App, 1: string} */
    private function app(RegistrationStatus $status = RegistrationStatus::Approved): array
    {
        $dir = $this->dir;
        $app = $this->createAppWithOverrides([ErrataController::class => fn() => new ErrataController(new FilesystemErrataRepository($dir))]);
        $c = $app->getContainer();
        $repo = $c->get(UserRepository::class);
        $repo->save(new User(new UserId(0), 'e@test.com', $c->get(PasswordHasher::class)->hash('pw'), Role::User, $status, new \DateTimeImmutable()));
        $token = (new JwtTokenIssuer($c->get('settings')['jwt']['secret']))->issue($repo->findByEmail('e@test.com'));
        return [$app, $token];
    }

    private function post(App $app, string $token, string $body): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/errata')
            ->withHeader('Authorization', "Bearer {$token}")
            ->withHeader('Content-Type', 'application/json');
        $request->getBody()->write($body);
        return $app->handle($request);
    }

    private function get(App $app, string $token, string $query): ResponseInterface
    {
        return $app->handle((new ServerRequestFactory())->createServerRequest('GET', '/api/errata?' . $query)->withHeader('Authorization', "Bearer {$token}"));
    }

    public function test_saves_an_entry_and_lists_it_by_book_and_chapter(): void
    {
        [$app, $token] = $this->app();
        $res = $this->post($app, $token, (string) json_encode(ErrataEntryValidatorTest::validEntry()));
        self::assertSame(201, $res->getStatusCode());
        $body = json_decode((string) $res->getBody(), true);
        self::assertSame('mis-geniales-predecesores-volumen-i/2-3.json', $body['path']);
        self::assertFileExists($this->dir . '/mis-geniales-predecesores-volumen-i/2-3.json');

        $list = $this->get($app, $token, http_build_query(['book' => 'Mis geniales predecesores. Volumen I', 'chapter' => 2]));
        self::assertSame(200, $list->getStatusCode());
        $entries = json_decode((string) $list->getBody(), true)['entries'];
        self::assertCount(1, $entries);
        self::assertSame('Rb1', $entries[0]['changes'][0]['to']);

        $none = json_decode((string) $this->get($app, $token, 'book=mis-geniales-predecesores-volumen-i&chapter=9')->getBody(), true);
        self::assertSame([], $none['entries']);
    }

    public function test_rejects_invalid_entries_with_the_reasons(): void
    {
        [$app, $token] = $this->app();
        $entry = ErrataEntryValidatorTest::validEntry();
        $entry['changes'] = [];
        $res = $this->post($app, $token, (string) json_encode($entry));
        self::assertSame(422, $res->getStatusCode());
        self::assertContains('changes must be a non-empty list', json_decode((string) $res->getBody(), true)['errors']);
        self::assertSame(400, $this->post($app, $token, 'not json')->getStatusCode());
    }

    public function test_a_title_that_tries_to_traverse_stays_inside_the_errata_folder(): void
    {
        [$app, $token] = $this->app();
        $entry = ErrataEntryValidatorTest::validEntry();
        $entry['book']['title'] = '../../../etc';
        $res = $this->post($app, $token, (string) json_encode($entry));
        self::assertSame(201, $res->getStatusCode());
        self::assertFileExists($this->dir . '/etc/2-3.json');
        $entry['book']['title'] = '../..';
        self::assertSame(422, $this->post($app, $token, (string) json_encode($entry))->getStatusCode());
    }

    public function test_listing_needs_a_book(): void
    {
        [$app, $token] = $this->app();
        self::assertSame(400, $this->get($app, $token, 'chapter=2')->getStatusCode());
    }

    public function test_needs_an_approved_user(): void
    {
        [$app, $token] = $this->app(RegistrationStatus::Pending);
        self::assertSame(403, $this->post($app, $token, (string) json_encode(ErrataEntryValidatorTest::validEntry()))->getStatusCode());
        self::assertSame(403, $this->get($app, $token, 'book=x')->getStatusCode());
    }
}

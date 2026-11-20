<?php

declare(strict_types=1);

namespace App\Tests\Unit\Presentation\Suggestions;

use App\Infrastructure\Suggestions\DbalSuggestionRepository;
use App\Infrastructure\Suggestions\FilesystemSuggestionAssetStore;
use App\Presentation\Suggestions\SuggestionsController;
use App\Tests\Unit\Application\Suggestions\SuggestionValidatorTest;
use App\Tests\Unit\Infrastructure\Suggestions\DbalSuggestionRepositoryTest;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;
use Slim\Psr7\UploadedFile;

final class SuggestionsControllerTest extends TestCase
{
    private const PNG = "\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    private string $dir;
    private DbalSuggestionRepository $repo;
    private SuggestionsController $controller;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/suggestion-assets-' . bin2hex(random_bytes(4));
        $this->repo = new DbalSuggestionRepository(DbalSuggestionRepositoryTest::migratedConnection(), maxPerBook: 3);
        $this->controller = new SuggestionsController($this->repo, new FilesystemSuggestionAssetStore($this->dir));
    }

    protected function tearDown(): void
    {
        if (is_dir($this->dir)) {
            exec('rm -rf ' . escapeshellarg($this->dir));
        }
    }

    private function request(string $method, string $uri, string $body = '', ?object $user = null): ServerRequestInterface
    {
        $r = (new ServerRequestFactory())->createServerRequest($method, $uri)
            ->withBody((new StreamFactory())->createStream($body))
            ->withAttribute('auth_user', $user ?? (object) ['sub' => 7, 'role' => 'user', 'status' => 'approved']);
        parse_str((string) parse_url($uri, PHP_URL_QUERY), $query);
        return $r->withQueryParams($query);
    }

    /** @return array<string, mixed> */
    private function body(ResponseInterface $r): array
    {
        return json_decode((string) $r->getBody(), true);
    }

    private function create(array $override = [], ?object $user = null): ResponseInterface
    {
        $body = (string) json_encode(SuggestionValidatorTest::validSuggestion($override));
        return $this->controller->create($this->request('POST', '/api/suggestions', $body, $user), new ResponseFactory()->createResponse());
    }

    public function test_create_stores_a_pending_suggestion(): void
    {
        $r = $this->create(['status' => 'applied']);
        self::assertSame(201, $r->getStatusCode());
        self::assertSame('pending', $this->body($r)['suggestion']['status']);
        self::assertSame(7, $this->repo->get('text-abc123.x_1')['createdBy']);
    }

    public function test_create_rejects_an_invalid_suggestion_with_422(): void
    {
        $r = $this->create(['kind' => 'script']);
        self::assertSame(422, $r->getStatusCode());
        self::assertNotEmpty($this->body($r)['errors']);
    }

    public function test_create_rejects_a_body_over_256_kb_with_413(): void
    {
        $body = (string) json_encode(SuggestionValidatorTest::validSuggestion(['after' => str_repeat('x', 300 * 1024)]));
        $r = $this->controller->create($this->request('POST', '/api/suggestions', $body), new ResponseFactory()->createResponse());
        self::assertSame(413, $r->getStatusCode());
    }

    public function test_create_rejects_a_non_object_with_400_and_a_duplicate_with_409(): void
    {
        $r = $this->controller->create($this->request('POST', '/api/suggestions', '[1'), new ResponseFactory()->createResponse());
        self::assertSame(400, $r->getStatusCode());
        self::assertSame(201, $this->create()->getStatusCode());
        self::assertSame(409, $this->create()->getStatusCode());
    }

    public function test_create_returns_507_when_the_book_is_full(): void
    {
        foreach (['a', 'b', 'c'] as $id) {
            self::assertSame(201, $this->create(['id' => $id])->getStatusCode());
        }
        self::assertSame(507, $this->create(['id' => 'd'])->getStatusCode());
    }

    public function test_list_filters_and_pages(): void
    {
        $this->create(['id' => 'a']);
        $this->create(['id' => 'b', 'kind' => 'image']);
        $r = $this->controller->list($this->request('GET', '/api/suggestions?kind=image&book=Sample%20Book%20Title&status=pending&offset=0&limit=10'), new ResponseFactory()->createResponse());
        self::assertSame(200, $r->getStatusCode());
        $body = $this->body($r);
        self::assertSame(1, $body['total']);
        self::assertSame('b', $body['items'][0]['id']);
    }

    public function test_list_rejects_unknown_filters_with_400(): void
    {
        foreach (['kind=bad', 'status=bad', 'limit=abc', 'chapter=-1'] as $q) {
            $r = $this->controller->list($this->request('GET', "/api/suggestions?{$q}"), new ResponseFactory()->createResponse());
            self::assertSame(400, $r->getStatusCode(), $q);
        }
    }

    public function test_patch_lets_the_owner_or_an_admin_change_the_status(): void
    {
        $this->create();
        $owner = $this->controller->updateStatus(
            $this->request('PATCH', '/api/suggestions/text-abc123.x_1', '{"status":"rejected"}'),
            new ResponseFactory()->createResponse(),
            'text-abc123.x_1',
        );
        self::assertSame(200, $owner->getStatusCode());
        self::assertSame('rejected', $this->repo->get('text-abc123.x_1')['status']);

        $stranger = (object) ['sub' => 8, 'role' => 'user'];
        $r = $this->controller->updateStatus(
            $this->request('PATCH', '/api/suggestions/text-abc123.x_1', '{"status":"rejected"}', $stranger),
            new ResponseFactory()->createResponse(),
            'text-abc123.x_1',
        );
        self::assertSame(403, $r->getStatusCode());

        $admin = (object) ['sub' => 1, 'role' => 'admin'];
        $r = $this->controller->updateStatus(
            $this->request('PATCH', '/api/suggestions/text-abc123.x_1', '{"status":"accepted"}', $admin),
            new ResponseFactory()->createResponse(),
            'text-abc123.x_1',
        );
        self::assertSame(200, $r->getStatusCode());
        self::assertSame('accepted', $this->repo->get('text-abc123.x_1')['status']);
    }

    private function patch(string $status, ?object $user = null): ResponseInterface
    {
        return $this->controller->updateStatus(
            $this->request('PATCH', '/x', (string) json_encode(['status' => $status]), $user),
            new ResponseFactory()->createResponse(),
            'text-abc123.x_1',
        );
    }

    public function test_the_author_may_only_withdraw_and_an_admin_reviews(): void
    {
        $this->create();
        self::assertSame(403, $this->patch('accepted')->getStatusCode());
        self::assertSame(403, $this->patch('applied')->getStatusCode());
        self::assertSame('pending', $this->repo->get('text-abc123.x_1')['status']);
        self::assertSame(200, $this->patch('rejected')->getStatusCode());
        self::assertSame('rejected', $this->repo->get('text-abc123.x_1')['status']);
        self::assertSame(200, $this->patch('accepted', (object) ['sub' => 1, 'role' => 'admin'])->getStatusCode());
        self::assertSame('accepted', $this->repo->get('text-abc123.x_1')['status']);
    }

    public function test_list_rejects_offset_and_limit_longer_than_9_digits(): void
    {
        foreach (['offset=1234567890', 'limit=99999999999999999999'] as $q) {
            $r = $this->controller->list($this->request('GET', "/api/suggestions?{$q}"), new ResponseFactory()->createResponse());
            self::assertSame(400, $r->getStatusCode(), $q);
        }
        $r = $this->controller->list($this->request('GET', '/api/suggestions?offset=123456789'), new ResponseFactory()->createResponse());
        self::assertSame(200, $r->getStatusCode());
    }

    public function test_patch_rejects_a_bad_status_and_a_missing_id(): void
    {
        $this->create();
        $r = $this->controller->updateStatus(
            $this->request('PATCH', '/x', '{"status":"deleted"}'),
            new ResponseFactory()->createResponse(),
            'text-abc123.x_1',
        );
        self::assertSame(422, $r->getStatusCode());
        $r = $this->controller->updateStatus(
            $this->request('PATCH', '/x', '{"status":"accepted"}'),
            new ResponseFactory()->createResponse(),
            'missing',
        );
        self::assertSame(404, $r->getStatusCode());
    }

    private function upload(string $bytes, string $clientName, string $clientType): ResponseInterface
    {
        $path = tempnam(sys_get_temp_dir(), 'up');
        file_put_contents($path, $bytes);
        $file = new UploadedFile($path, $clientName, $clientType, strlen($bytes), UPLOAD_ERR_OK);
        $request = $this->request('POST', '/api/suggestions/assets')->withUploadedFiles(['file' => $file]);
        return $this->controller->uploadAsset($request, new ResponseFactory()->createResponse());
    }

    public function test_upload_stores_a_png_by_its_hash_and_serves_it_back(): void
    {
        $r = $this->upload(self::PNG . 'rest', 'x.png', 'image/png');
        self::assertSame(201, $r->getStatusCode());
        $name = hash('sha256', self::PNG . 'rest') . '.png';
        self::assertSame("suggestions/assets/{$name}", $this->body($r)['path']);
        self::assertFileExists("{$this->dir}/{$name}");

        $get = $this->controller->getAsset($this->request('GET', "/api/suggestions/assets/{$name}"), new ResponseFactory()->createResponse(), $name);
        self::assertSame(200, $get->getStatusCode());
        self::assertSame('image/png', $get->getHeaderLine('Content-Type'));
        self::assertSame('nosniff', $get->getHeaderLine('X-Content-Type-Options'));
        self::assertSame(self::PNG . 'rest', (string) $get->getBody());
    }

    public function test_upload_rejects_svg_and_other_types_by_content_with_415(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
        self::assertSame(415, $this->upload($svg, 'x.png', 'image/png')->getStatusCode());
        self::assertSame(415, $this->upload('GIF89a....', 'x.gif', 'image/gif')->getStatusCode());
    }

    public function test_upload_rejects_files_over_5_mb_with_413_and_a_missing_file_with_400(): void
    {
        self::assertSame(413, $this->upload(self::PNG . str_repeat("\0", 5 * 1024 * 1024), 'x.png', 'image/png')->getStatusCode());
        $r = $this->controller->uploadAsset($this->request('POST', '/api/suggestions/assets'), new ResponseFactory()->createResponse());
        self::assertSame(400, $r->getStatusCode());
    }

    public function test_get_asset_refuses_bad_names_and_missing_files(): void
    {
        foreach (['../x.png', 'abc.png', str_repeat('a', 64) . '.svg'] as $name) {
            $r = $this->controller->getAsset($this->request('GET', '/x'), new ResponseFactory()->createResponse(), $name);
            self::assertSame(404, $r->getStatusCode(), $name);
        }
        $r = $this->controller->getAsset($this->request('GET', '/x'), new ResponseFactory()->createResponse(), str_repeat('a', 64) . '.png');
        self::assertSame(404, $r->getStatusCode());
    }
}

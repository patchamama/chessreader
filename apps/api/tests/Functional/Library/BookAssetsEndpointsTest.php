<?php

declare(strict_types=1);

namespace App\Tests\Functional\Library;

use App\Tests\Fixtures\epub\EpubBuilder as B;
use App\Tests\TestCase;
use Slim\Psr7\Factory\ServerRequestFactory;

/**
 * The cover and the chapter images are requested by plain <img> tags, which
 * cannot carry the Authorization header: both are public, image-only reads.
 */
final class BookAssetsEndpointsTest extends TestCase
{
    private const BOOK_ID = 987650;

    private string $stored;

    protected function setUp(): void
    {
        parent::setUp();
        $dir = __DIR__ . '/../../../storage/books';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $this->stored = $dir . '/' . self::BOOK_ID . '.epub';
        $built = B::zip([
            'OEBPS/content.opf' => B::opf(
                '<item id="d1" href="Images/diagram1.jpg" media-type="image/jpeg"/>'
                . '<item id="art" href="Images/portada.png" media-type="image/png"/>'
                . '<item id="cp" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>',
                '<itemref idref="cp"/>',
                guide: '<guide><reference type="cover" title="Cover" href="Text/cover.xhtml"/></guide>',
            ),
            'OEBPS/Text/cover.xhtml'  => B::xhtml('<div><img src="../Images/portada.png" alt=""/></div>'),
            'OEBPS/Images/diagram1.jpg' => 'DIAGRAM',
            'OEBPS/Images/portada.png'  => 'COVERPNG',
        ]);
        rename($built, $this->stored);
    }

    protected function tearDown(): void
    {
        @unlink($this->stored);
        parent::tearDown();
    }

    private function get(string $uri): \Psr\Http\Message\ResponseInterface
    {
        return $this->createApp()->handle((new ServerRequestFactory())->createServerRequest('GET', $uri));
    }

    public function testCoverIsTheGuideCoverPageImageNotTheFirstImage(): void
    {
        $res = $this->get('/api/library/books/' . self::BOOK_ID . '/cover');

        self::assertSame(200, $res->getStatusCode());
        self::assertSame('COVERPNG', (string) $res->getBody());
        self::assertSame('image/png', $res->getHeaderLine('Content-Type'));
    }

    public function testChapterImageIsServedWithoutAToken(): void
    {
        $res = $this->get('/api/library/books/' . self::BOOK_ID . '/images/Images/diagram1.jpg');

        self::assertSame(200, $res->getStatusCode());
        self::assertSame('DIAGRAM', (string) $res->getBody());
        self::assertSame('image/jpeg', $res->getHeaderLine('Content-Type'));
    }

    public function testImageRouteRefusesNonImageEntries(): void
    {
        $res = $this->get('/api/library/books/' . self::BOOK_ID . '/images/Text/cover.xhtml');

        self::assertSame(404, $res->getStatusCode());
    }

    public function testChaptersStillRequireAToken(): void
    {
        $res = $this->get('/api/library/books/' . self::BOOK_ID . '/chapters/1');

        self::assertSame(401, $res->getStatusCode());
    }
}

<?php

declare(strict_types=1);

namespace App\Presentation\Suggestions;

use App\Application\Errata\BookSlug;
use App\Application\Suggestions\ApplySuggestionsToEpub;
use App\Application\Suggestions\RestoreEpubBackup;
use App\Domain\Library\BookRepository;
use App\Infrastructure\Epub\EpubBusyException;
use App\Infrastructure\Epub\EpubPackage;
use App\Infrastructure\Epub\OpfManifestParser;
use App\Infrastructure\Epub\StoredEpubs;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Factory\StreamFactory;

/**
 * A book's stored EPUB: writing the accepted suggestions into it, its backups
 * and undo, its download, and the list of its images (to pick a cover).
 *
 *   POST /api/library/books/{id}/apply-suggestions          (admin) → {applied, stale, backup}
 *   GET  /api/library/books/{id}/backups                    (admin) → {backups: [{name, size, createdAt, applied}]}
 *   POST /api/library/books/{id}/restore-backup {backup}    (admin) → {restored, backup, reverted, reapplied}
 *   GET  /api/library/books/{id}/epub                       (owner or admin) the .epub as an attachment
 *   GET  /api/library/books/{id}/images                     → {images: [{path, url, cover}]}
 */
final class BookEpubController
{
    public function __construct(
        private readonly ApplySuggestionsToEpub $apply,
        private readonly RestoreEpubBackup $restore,
        private readonly StoredEpubs $epubs,
        private readonly BookRepository $books,
    ) {
    }

    public function applySuggestions(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        if (!$this->isAdmin($request)) {
            return $this->json($response, ['error' => 'only an admin can write suggestions into the EPUB'], 403);
        }
        try {
            return $this->json($response, ['ok' => true, ...$this->apply->handle($id)]);
        } catch (\OutOfBoundsException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        } catch (EpubBusyException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 409);
        } catch (\Throwable $e) {
            error_log('apply-suggestions failed for book ' . $id . ': ' . $e->getMessage());
            return $this->json($response, ['error' => 'could not write the suggestions into the EPUB; it was left as it was'], 500);
        }
    }

    public function backups(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        if (!$this->isAdmin($request)) {
            return $this->json($response, ['error' => 'only an admin can see the backups'], 403);
        }
        if ($this->books->findById($id) === null) {
            return $this->json($response, ['error' => 'book not found'], 404);
        }
        return $this->json($response, ['backups' => $this->epubs->backups($id)]);
    }

    public function restoreBackup(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        if (!$this->isAdmin($request)) {
            return $this->json($response, ['error' => 'only an admin can restore a backup'], 403);
        }
        $raw = (string) $request->getBody();
        $body = strlen($raw) <= 1024 ? json_decode($raw, true) : null;
        $name = is_array($body) ? ($body['backup'] ?? null) : null;
        if (!is_string($name) || $name === '') {
            return $this->json($response, ['error' => 'backup (the backup file name) is required'], 422);
        }
        try {
            return $this->json($response, ['ok' => true, ...$this->restore->handle($id, $name)]);
        } catch (\InvalidArgumentException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 422);
        } catch (\OutOfBoundsException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 404);
        } catch (EpubBusyException $e) {
            return $this->json($response, ['error' => $e->getMessage()], 409);
        } catch (\Throwable $e) {
            error_log('restore-backup failed for book ' . $id . ': ' . $e->getMessage());
            return $this->json($response, ['error' => 'could not restore the backup'], 500);
        }
    }

    public function download(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        $book = $this->books->findById($id);
        if ($book === null || !$this->epubs->exists($id)) {
            return $this->json($response, ['error' => 'book not found'], 404);
        }
        if (!$this->isAdmin($request) && $book->ownerId !== $this->userId($request)) {
            return $this->json($response, ['error' => 'only the owner or an admin can download this book'], 403);
        }
        $slug = BookSlug::of($book->title);
        $filename = ($slug !== '' ? $slug : "book-{$id}") . '.epub';
        $path = $this->epubs->path($id);
        return $response
            ->withBody((new StreamFactory())->createStreamFromFile($path, 'rb'))
            ->withHeader('Content-Type', 'application/epub+zip')
            ->withHeader('Content-Disposition', "attachment; filename=\"{$filename}\"")
            ->withHeader('Content-Length', (string) filesize($path))
            ->withHeader('Cache-Control', 'private, no-store')
            ->withHeader('X-Content-Type-Options', 'nosniff');
    }

    public function images(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        if ($this->books->findById($id) === null || !$this->epubs->exists($id)) {
            return $this->json($response, ['error' => 'book not found'], 404);
        }
        $zip = new \ZipArchive();
        if ($zip->open($this->epubs->path($id), \ZipArchive::RDONLY) !== true) {
            return $this->json($response, ['error' => 'cannot read the EPUB'], 500);
        }
        try {
            $package = EpubPackage::fromZip($zip);
            $opfPath = $package->opfPath();
            $xml = $opfPath !== null ? $zip->getFromName($opfPath) : false;
            $parsed = $xml !== false ? (new OpfManifestParser())->parseXml($xml) : ['images' => []];
            $cover = $package->coverPath();
            $opfDir = $opfPath !== null && dirname($opfPath) !== '.' ? dirname($opfPath) . '/' : '';
            $images = [];
            foreach ($parsed['images'] as $href) {
                $path = self::normalize($opfDir . rawurldecode((string) $href));
                if ($path === '' || $zip->locateName($path) === false) {
                    continue;
                }
                $images[$path] = [
                    'path' => $path,
                    'url' => "/api/library/books/{$id}/images/" . implode('/', array_map('rawurlencode', explode('/', $path))),
                    'cover' => $path === $cover,
                ];
            }
        } catch (\RuntimeException) {
            $images = [];
        } finally {
            $zip->close();
        }
        return $this->json($response, ['images' => array_values($images)]);
    }

    private static function normalize(string $path): string
    {
        $parts = [];
        foreach (explode('/', $path) as $seg) {
            if ($seg === '' || $seg === '.') {
                continue;
            }
            if ($seg === '..') {
                array_pop($parts);
                continue;
            }
            $parts[] = $seg;
        }
        return implode('/', $parts);
    }

    private function isAdmin(ServerRequestInterface $request): bool
    {
        return ($request->getAttribute('auth_user')?->role ?? '') === 'admin';
    }

    private function userId(ServerRequestInterface $request): ?int
    {
        $sub = $request->getAttribute('auth_user')?->sub ?? null;
        return is_int($sub) || (is_string($sub) && ctype_digit($sub)) ? (int) $sub : null;
    }

    /** @param array<string, mixed> $body */
    private function json(ResponseInterface $response, array $body, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

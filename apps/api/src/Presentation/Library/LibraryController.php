<?php

declare(strict_types=1);

namespace App\Presentation\Library;

use App\Application\Library\GetChapterHandler;
use App\Application\Library\ListBooksHandler;
use App\Application\Library\SetLastReadBookCommand;
use App\Application\Library\SetLastReadBookHandler;
use App\Application\Library\UpdateBookCommand;
use App\Application\Library\UpdateBookHandler;
use App\Domain\Auth\Role;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class LibraryController
{
    public function __construct(
        private readonly ListBooksHandler      $listBooks,
        private readonly GetChapterHandler     $getChapter,
        private readonly UpdateBookHandler     $updateBook,
        private readonly SetLastReadBookHandler $setLastReadBook,
    ) {}

    public function books(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $authUser = $request->getAttribute('auth_user');
        $userId   = (int) $authUser->sub;
        $books  = $this->listBooks->handle($userId);

        $response->getBody()->write(json_encode($books));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function chapter(
        ServerRequestInterface $request,
        ResponseInterface $response,
        int $id,
        int $n,
    ): ResponseInterface {
        $result = $this->getChapter->handle($id, $n);

        if ($result === null) {
            $response->getBody()->write(json_encode(['error' => 'Not found']));
            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        }

        $response->getBody()->write(json_encode($result));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function updateBook(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        $authUser  = $request->getAttribute('auth_user');
        $ownerId   = (int) $authUser->sub;
        $isAdmin   = isset($authUser->role) && $authUser->role === Role::Admin->value;
        $body      = (array) json_decode((string) $request->getBody(), true);
        $title       = $body['title'] ?? '';
        $author      = $body['author'] ?? '';
        $description = $body['description'] ?? '';

        // If partial update: load existing book to fill missing fields
        // For simplicity, require all fields or use '' as default
        try {
            $book = $this->updateBook->handle(new UpdateBookCommand(
                bookId:      $id,
                ownerId:     $ownerId,
                title:       $title,
                author:      $author,
                description: $description,
                isAdmin:     $isAdmin,
            ));
        } catch (\RuntimeException $e) {
            $msg = $e->getMessage();
            if (str_contains($msg, 'Forbidden') || str_contains($msg, 'not the book owner')) {
                $response->getBody()->write(json_encode(['error' => $msg]));
                return $response->withStatus(403)->withHeader('Content-Type', 'application/json');
            }
            $response->getBody()->write(json_encode(['error' => $msg]));
            return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
        }

        $response->getBody()->write(json_encode([
            'id'          => $book->id,
            'title'       => $book->title,
            'author'      => $book->author,
            'description' => $book->description,
        ]));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function image(ServerRequestInterface $request, ResponseInterface $response, int $id, string $path): ResponseInterface
    {
        $epubFile = __DIR__ . '/../../../storage/books/' . $id . '.epub';
        if (!is_file($epubFile)) {
            return $response->withStatus(404);
        }

        // path arrives URL-encoded; decode and strip leading slashes/dots for safety
        $innerPath = ltrim(urldecode($path), '/.');
        // Prevent path traversal
        if (str_contains($innerPath, '..')) {
            return $response->withStatus(400);
        }

        $zip = new \ZipArchive();
        if ($zip->open($epubFile) !== true) {
            return $response->withStatus(500);
        }

        // Try the path directly, then try common sub-dirs
        $content = $zip->getFromName($innerPath);
        if ($content === false) {
            // Search for the basename inside the zip
            $basename = basename($innerPath);
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = $zip->getNameIndex($i);
                if ($name !== false && basename($name) === $basename) {
                    $content = $zip->getFromIndex($i);
                    break;
                }
            }
        }
        $zip->close();

        if ($content === false) {
            return $response->withStatus(404);
        }

        $ext  = strtolower(pathinfo($innerPath, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'png'  => 'image/png',
            'gif'  => 'image/gif',
            'webp' => 'image/webp',
            'svg'  => 'image/svg+xml',
            default => 'image/jpeg',
        };

        $response->getBody()->write($content);
        return $response
            ->withHeader('Content-Type', $mime)
            ->withHeader('Cache-Control', 'public, max-age=86400');
    }

    public function touch(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        $authUser = $request->getAttribute('auth_user');
        $userId   = (int) $authUser->sub;

        $this->setLastReadBook->handle(new SetLastReadBookCommand(userId: $userId, bookId: $id));

        $response->getBody()->write(json_encode(['ok' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    }
}

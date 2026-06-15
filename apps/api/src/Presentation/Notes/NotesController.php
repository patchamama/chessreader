<?php

declare(strict_types=1);

namespace App\Presentation\Notes;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Free-form per-user scratch notes, stored as a plain text file
 * (notes.<userId>.txt) under the storage directory. No domain model
 * or DB row is needed — notes carry no business invariants.
 */
final class NotesController
{
    public function __construct(
        private readonly string $storageDir,
    ) {}

    public function get(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId = (int) $request->getAttribute('auth_user')->sub;
        $file   = $this->fileFor($userId);

        $content = is_file($file) ? (file_get_contents($file) ?: '') : '';

        $response->getBody()->write(json_encode(['content' => $content]));
        return $response->withHeader('Content-Type', 'application/json');
    }

    public function save(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $userId  = (int) $request->getAttribute('auth_user')->sub;
        $body    = (array) json_decode((string) $request->getBody(), true);
        $content = is_string($body['content'] ?? null) ? $body['content'] : '';

        $dir = $this->notesDir();
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        // Atomic write: temp file + rename, so a concurrent read never sees a partial file.
        $file = $this->fileFor($userId);
        $tmp  = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($tmp, $content) === false || !@rename($tmp, $file)) {
            @unlink($tmp);
            $response->getBody()->write(json_encode(['error' => 'Failed to save notes']));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }

        $response->getBody()->write(json_encode(['ok' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    }

    private function notesDir(): string
    {
        return rtrim($this->storageDir, '/') . '/notes';
    }

    /** userId is cast to int by the caller, so the filename can never traverse. */
    private function fileFor(int $userId): string
    {
        return $this->notesDir() . '/notes.' . $userId . '.txt';
    }
}

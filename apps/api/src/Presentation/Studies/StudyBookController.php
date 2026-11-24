<?php

declare(strict_types=1);

namespace App\Presentation\Studies;

use App\Application\Ingestion\Command\ProcessEpubCommand;
use App\Application\Ingestion\ProcessEpubHandler;
use App\Infrastructure\Epub\StudyEpubBuilder;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Adds a Lichess study to the user's library as a book.
 *
 *   POST /api/studies/to-book {title, author, language, chapters, images, cover}
 *        → 201 {bookId, status:"ready"}   (see StudyEpubBuilder for the payload)
 *
 * The structured book is written as an EPUB 3 and then ingested by the same
 * handler as an uploaded EPUB, so the book appears in the library with its
 * title, author, language and cover.
 */
final class StudyBookController
{
    private const MAX_BODY = 40_000_000;

    public function __construct(
        private readonly StudyEpubBuilder $builder,
        private readonly ProcessEpubHandler $ingest,
    ) {
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $user = $request->getAttribute('auth_user');
        if ($user === null) {
            return $this->json($response, ['error' => 'Authentication required'], 401);
        }
        $raw = (string) $request->getBody();
        if (strlen($raw) > self::MAX_BODY) {
            return $this->json($response, ['error' => 'The book is too large'], 413);
        }
        $book = json_decode($raw, true);
        if (!is_array($book)) {
            return $this->json($response, ['error' => 'Send the book as a JSON object'], 400);
        }

        $tmp = sys_get_temp_dir() . '/study_book_' . bin2hex(random_bytes(8)) . '.epub';
        try {
            try {
                $this->builder->build($book, $tmp);
            } catch (\InvalidArgumentException $e) {
                return $this->json($response, ['error' => $e->getMessage()], 422);
            }
            try {
                $bookId = $this->ingest->handle(new ProcessEpubCommand(ownerId: (int) $user->sub, epubPath: $tmp));
            } catch (\Throwable) {
                return $this->json($response, ['error' => 'The book could not be added to the library'], 422);
            }
            return $this->json($response, ['bookId' => $bookId, 'status' => 'ready'], 201);
        } finally {
            if (is_file($tmp)) {
                unlink($tmp);
            }
        }
    }

    /** @param array<string,mixed> $body */
    private function json(ResponseInterface $response, array $body, int $status): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($body));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

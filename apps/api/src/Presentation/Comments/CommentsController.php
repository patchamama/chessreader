<?php

declare(strict_types=1);

namespace App\Presentation\Comments;

use App\Application\Comments\Port\CommentsReadOnly;
use App\Application\Comments\Port\PositionCommentStore;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/** What authors said about a position, and the game a comment comes from. */
final class CommentsController
{
    public function __construct(private readonly PositionCommentStore $store)
    {
    }

    public function position(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $hash = (string) ($q['hash'] ?? '');
        $fen = trim((string) ($q['fen'] ?? ''));
        if (!preg_match('/^[0-9a-f]{16}$/', $hash) || $fen === '') {
            return $this->json($response, ['error' => 'hash and fen are required'], 400);
        }
        $key = implode(' ', array_slice(preg_split('/\s+/', $fen) ?: [], 0, 4));
        return $this->json($response, ['comments' => $this->store->forPosition($hash, $key, (int) ($q['limit'] ?? 5))]);
    }

    /** GET /api/comments/top?limit(≤100, 50)&q&source&lang&kind: the positions with most comments. */
    public function top(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $kind = (string) ($q['kind'] ?? '');
        $lang = (string) ($q['lang'] ?? '');
        if (!in_array($kind, ['', 'book', 'lichess'], true) || !preg_match('/^[a-z]{0,3}$/', $lang)) {
            return $this->json($response, ['error' => 'kind is book or lichess; lang is a language code'], 400);
        }
        $filters = ['q' => mb_substr(trim((string) ($q['q'] ?? '')), 0, 200), 'lang' => $lang, 'kind' => $kind];
        if (isset($q['source']) && preg_match('/^\d{1,9}$/', (string) $q['source'])) {
            $filters['source'] = (int) $q['source'];
        }
        $limit = max(1, min(100, (int) ($q['limit'] ?? 50)));
        $rank = 0;
        $positions = array_map(static function (array $p) use (&$rank): array {
            unset($p['hash']);
            return ['rank' => ++$rank] + $p;
        }, $this->store->top($filters, $limit));
        return $this->json($response, ['positions' => $positions]);
    }

    /** GET /api/comments?offset&limit(≤200)&q&source&lang&kind: a page of every comment and the total. */
    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $q = $request->getQueryParams();
        $kind = (string) ($q['kind'] ?? '');
        $lang = (string) ($q['lang'] ?? '');
        if (!in_array($kind, ['', 'book', 'lichess'], true) || !preg_match('/^[a-z]{0,3}$/', $lang)) {
            return $this->json($response, ['error' => 'kind is book or lichess; lang is a language code'], 400);
        }
        $filters = ['q' => mb_substr(trim((string) ($q['q'] ?? '')), 0, 200), 'lang' => $lang, 'kind' => $kind, 'hidden' => ($q['hidden'] ?? '0') === '1'];
        if (isset($q['source']) && preg_match('/^\d{1,9}$/', (string) $q['source'])) {
            $filters['source'] = (int) $q['source'];
        }
        $offset = max(0, (int) ($q['offset'] ?? 0));
        $limit = max(1, min(200, (int) ($q['limit'] ?? 50)));
        $page = $this->store->list($filters, $offset, $limit);
        return $this->json($response, ['total' => $page['total'], 'offset' => $offset, 'limit' => $limit, 'comments' => $page['comments']]);
    }

    /** GET /api/comments/sources: the books and studies the comments come from. */
    public function sources(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, ['sources' => $this->store->sources()]);
    }

    public function game(ServerRequestInterface $request, ResponseInterface $response, string $id): ResponseInterface
    {
        $game = $this->store->game($id);
        if ($game === null) {
            return $this->json($response, ['error' => 'not found'], 404);
        }
        $game['translations'] = (object) $game['translations']; // {} rather than [] when there are none
        return $this->json($response, $game);
    }

    /** PUT /api/comments/games/{id}/translations/{lang} {pgn}: saves the PGN of a game in a language; 404 unknown game, 409 read-only. */
    public function setGameTranslation(ServerRequestInterface $request, ResponseInterface $response, string $id, string $lang): ResponseInterface
    {
        $body = $request->getParsedBody();
        $pgn = is_array($body) && is_string($body['pgn'] ?? null) ? trim($body['pgn']) : '';
        if (!preg_match('/^[a-z]{2,3}$/', $lang) || $pgn === '' || mb_strlen($pgn) > self::MAX_PGN) {
            return $this->json($response, ['error' => 'lang is a language code and pgn is 1 to 400000 characters'], 400);
        }
        try {
            $found = $this->store->setGameTranslation($id, $lang, $pgn);
        } catch (CommentsReadOnly) {
            return $this->json($response, ['error' => self::READ_ONLY], 409);
        }
        return $found ? $this->json($response, ['saved' => $id, 'lang' => $lang]) : $this->json($response, ['error' => 'not found'], 404);
    }

    /**
     * POST /api/comments/book-games {book, chapter, game}: adds a book game with its comments and
     * translations to the database (see PositionCommentStore::addBookGame); 400 invalid, 409 read-only.
     */
    public function addBookGame(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = $this->validBookGame($request->getParsedBody());
        if ($data === null) {
            return $this->json($response, ['error' => 'invalid book game'], 400);
        }
        try {
            return $this->json($response, $this->store->addBookGame($data));
        } catch (CommentsReadOnly) {
            return $this->json($response, ['error' => self::READ_ONLY], 409);
        }
    }

    private const MAX_PGN = 400000;
    private const MAX_TEXT = 20000;
    private const MAX_COMMENTS = 500;
    private const READ_ONLY = 'The comments database is read-only on this server; change the comment where it is built';

    /** @return ?array<string, mixed> the cleaned body, or null when anything is off */
    private function validBookGame(mixed $body): ?array
    {
        $str = static fn(mixed $v, int $min, int $max): ?string => is_string($v) && mb_strlen(trim($v)) >= $min && mb_strlen($v) <= $max ? trim($v) : null;
        $optional = static fn(mixed $v): ?string => is_string($v) && trim($v) !== '' ? mb_substr(trim($v), 0, 300) : null;
        if (!is_array($body) || !is_array($body['book'] ?? null) || !is_array($body['game'] ?? null)) {
            return null;
        }
        $title = $str($body['book']['title'] ?? null, 1, 300);
        $lang = $body['book']['lang'] ?? null;
        $chapter = $body['chapter'] ?? null;
        $g = $body['game'];
        $pgn = $str($g['pgn'] ?? null, 1, self::MAX_PGN);
        if ($title === null || !is_string($lang) || !preg_match('/^[a-z]{2,3}$/', $lang) || !is_int($chapter) || $chapter < 0 || $pgn === null
            || !is_array($g['comments'] ?? null) || !array_is_list($g['comments']) || count($g['comments']) > self::MAX_COMMENTS) {
            return null;
        }
        $comments = [];
        foreach ($g['comments'] as $c) {
            $text = is_array($c) ? $str($c['text'] ?? null, 1, self::MAX_TEXT) : null;
            $key = is_array($c) ? $str($c['key'] ?? null, 1, 200) : null;
            $san = is_array($c) ? $str($c['san'] ?? null, 1, 20) : null;
            if ($text === null || $key === null || $san === null || !is_string($c['hash'] ?? null) || !preg_match('/^[0-9a-f]{16}$/', $c['hash'])
                || !is_int($c['ply'] ?? null) || $c['ply'] < 0 || !is_int($c['move'] ?? null) || $c['move'] < 0
                // A comment printed before the first move is told by san "@intro" and ply 0, and only it has ply 0.
                || (($san === PositionCommentStore::INTRO_SAN) !== ($c['ply'] === 0))) {
                return null;
            }
            $comments[] = ['hash' => $c['hash'], 'key' => $key, 'ply' => $c['ply'], 'move' => $c['move'], 'san' => $san, 'text' => $text];
        }
        $translations = [];
        $rawTranslations = $g['translations'] ?? [];
        if (!is_array($rawTranslations)) {
            return null;
        }
        foreach ($rawTranslations as $tl => $t) {
            if (!is_string($tl) || !preg_match('/^[a-z]{2,3}$/', $tl) || !is_array($t)) {
                return null;
            }
            $entry = [];
            if (array_key_exists('pgn', $t)) {
                $tp = $str($t['pgn'], 1, self::MAX_PGN);
                if ($tp === null) {
                    return null;
                }
                $entry['pgn'] = $tp;
            }
            if (array_key_exists('comments', $t)) {
                if (!is_array($t['comments']) || !array_is_list($t['comments']) || count($t['comments']) !== count($comments)) {
                    return null;
                }
                foreach ($t['comments'] as $text) {
                    if (!is_string($text) || mb_strlen($text) > self::MAX_TEXT) {
                        return null;
                    }
                    $entry['comments'][] = trim($text);
                }
            }
            $translations[$tl] = $entry;
        }
        return [
            'book' => ['title' => $title, 'author' => $optional($body['book']['author'] ?? null), 'lang' => $lang],
            'chapter' => $chapter,
            'game' => ['label' => $optional($g['label'] ?? null), 'white' => $optional($g['white'] ?? null), 'black' => $optional($g['black'] ?? null),
                'pgn' => $pgn, 'comments' => $comments, 'translations' => $translations],
        ];
    }

    /** DELETE /api/comments/{id}: hides a comment (it stays in the database); 404 unknown, 409 read-only database. */
    public function delete(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        return $this->toggle($response, $id, true);
    }

    /** POST /api/comments/{id}/restore: shows a hidden comment again. */
    public function restore(ServerRequestInterface $request, ResponseInterface $response, int $id): ResponseInterface
    {
        return $this->toggle($response, $id, false);
    }

    /** PUT /api/comments/{id}/translations/{lang} {text}: saves the universal text or a translation of a comment. */
    public function setTranslation(ServerRequestInterface $request, ResponseInterface $response, int $id, string $lang): ResponseInterface
    {
        $body = $request->getParsedBody();
        $text = is_array($body) && is_string($body['text'] ?? null) ? trim($body['text']) : '';
        if (!preg_match('/^[a-z]{2,3}$/', $lang) || $text === '' || mb_strlen($text) > 20000) {
            return $this->json($response, ['error' => 'lang is a language code and text is 1 to 20000 characters'], 400);
        }
        try {
            $found = $this->store->setTranslation($id, $lang, $text);
        } catch (CommentsReadOnly) {
            return $this->json($response, ['error' => 'The comments database is read-only on this server; change the comment where it is built'], 409);
        }
        return $found ? $this->json($response, ['saved' => $id, 'lang' => $lang]) : $this->json($response, ['error' => 'not found'], 404);
    }

    private function toggle(ResponseInterface $response, int $id, bool $hide): ResponseInterface
    {
        try {
            $found = $hide ? $this->store->hide($id) : $this->store->restore($id);
        } catch (CommentsReadOnly) {
            return $this->json($response, ['error' => 'The comments database is read-only on this server; change the comment where it is built'], 409);
        }
        return $found ? $this->json($response, [$hide ? 'hidden' : 'restored' => $id]) : $this->json($response, ['error' => 'not found'], 404);
    }

    /** @param array<string, mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($data));
        return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
    }
}

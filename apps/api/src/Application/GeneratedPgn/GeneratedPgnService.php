<?php

declare(strict_types=1);

namespace App\Application\GeneratedPgn;

/** Use cases of the generated-PGN area: validation, ownership and the upload to a Lichess study. */
final class GeneratedPgnService
{
    public const MAX_GAMES = 200;
    public const MAX_PGN = 200_000;
    public const STATUSES = ['new', 'reviewed', 'rejected'];
    private const RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];
    private const VISIBILITY = ['private', 'public'];
    public const UPLOAD_NOTE = 'The Lichess API cannot create a study or change its visibility: the PGN was added as new chapters of the study you named. Set it private or public in Lichess (study settings).';

    public function __construct(
        private readonly GeneratedPgnRepository $repo,
        private readonly LichessStudyImporter $lichess,
        /** @var callable(): string */
        private $clock = null,
    ) {
        $this->clock ??= static fn (): string => gmdate('Y-m-d\TH:i:s\Z');
    }

    /** @return array{items: list<array<string, mixed>>, books: list<array<string, mixed>>} */
    public function list(?int $bookId, ?string $status, ?string $q, ?int $userId = null, bool $isAdmin = false): array
    {
        if ($status !== null && !in_array($status, self::STATUSES, true)) {
            throw new \InvalidArgumentException('unknown status');
        }
        $rows = $this->repo->list($bookId, $status, $q !== null && trim($q) !== '' ? trim($q) : null);
        return ['items' => array_map(fn (array $r): array => $this->withAccess($r, $userId, $isAdmin), $rows), 'books' => $this->repo->books()];
    }

    /** @return array<string, mixed> */
    public function get(int $id, ?int $userId = null, bool $isAdmin = false): array
    {
        return $this->withAccess($this->repo->find($id) ?? throw new \OutOfBoundsException('generated PGN not found'), $userId, $isAdmin);
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function withAccess(array $row, ?int $userId, bool $isAdmin): array
    {
        $owner = $row['createdBy'] ?? null;
        return $row + ['canWrite' => $isAdmin || ($owner !== null && $owner === $userId)];
    }

    /**
     * @param mixed $games the list of games to keep
     * @return array{created: int, updated: int, skipped: int}
     */
    public function create(mixed $games, ?int $userId): array
    {
        if (!is_array($games) || !array_is_list($games) || $games === []) {
            throw new \InvalidArgumentException('games must be a non-empty list');
        }
        if (count($games) > self::MAX_GAMES) {
            throw new \InvalidArgumentException('at most ' . self::MAX_GAMES . ' games per request');
        }
        $clean = array_map(fn (mixed $g): array => $this->game($g), $games);
        $now = ($this->clock)();
        $out = ['created' => 0, 'updated' => 0, 'skipped' => 0];
        foreach ($clean as $g) {
            $old = $this->repo->findByKey($g['book_id'], $g['chapter'], $g['game_index'], $userId);
            if ($old === null) {
                $this->repo->insert($g, $userId, $now);
                $out['created']++;
            } elseif ($old['status'] === 'new') {
                $this->repo->update((int) $old['id'], $g, $now);
                $out['updated']++;
            } else {
                $out['skipped']++;
            }
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $patch
     * @return array<string, mixed>
     */
    public function update(int $id, array $patch, ?int $userId, bool $isAdmin): array
    {
        $this->owned($id, $userId, $isAdmin);
        $fields = [];
        if (array_key_exists('status', $patch)) {
            if (!is_string($patch['status']) || !in_array($patch['status'], self::STATUSES, true)) {
                throw new \InvalidArgumentException('status must be new, reviewed or rejected');
            }
            $fields['status'] = $patch['status'];
        }
        if (array_key_exists('pgn', $patch)) {
            $fields['pgn'] = $this->pgn($patch['pgn']);
        }
        foreach (['white', 'black', 'event'] as $k) {
            if (array_key_exists($k, $patch)) {
                $fields[$k] = $this->text($patch[$k], $k, 200);
            }
        }
        if (array_key_exists('result', $patch)) {
            $fields['result'] = $this->result($patch['result']);
        }
        if ($fields === []) {
            throw new \InvalidArgumentException('nothing to update');
        }
        $this->repo->update($id, $fields, ($this->clock)());
        return $this->get($id, $userId, $isAdmin);
    }

    public function delete(int $id, ?int $userId, bool $isAdmin): void
    {
        $this->owned($id, $userId, $isAdmin);
        $this->repo->delete($id);
    }

    /**
     * Adds the PGN as chapters of an existing study. The token is used for this call only.
     *
     * @return array{url: string, chapters: list<array{id: string, name: string}>, visibility: string, visibilityApplied: bool, note: string}
     */
    public function uploadToLichess(int $id, mixed $studyRef, mixed $visibility, mixed $token, ?int $userId, bool $isAdmin): array
    {
        $item = $this->owned($id, $userId, $isAdmin);
        $studyId = is_string($studyRef) ? self::studyId($studyRef) : null;
        if ($studyId === null) {
            throw new \InvalidArgumentException('studyId must be the id (8 letters or digits) or the URL of an existing Lichess study');
        }
        if (!is_string($visibility) || !in_array($visibility, self::VISIBILITY, true)) {
            throw new \InvalidArgumentException('visibility must be private or public');
        }
        if (!is_string($token) || !preg_match('/^[A-Za-z0-9_]{20,100}$/', $token)) {
            throw new \InvalidArgumentException('token must be a Lichess personal access token with the study:write scope');
        }
        $chapters = $this->lichess->importPgn($studyId, (string) $item['pgn'], $token);
        $url = "https://lichess.org/study/{$studyId}";
        $this->repo->update($id, ['lichess_url' => $url], ($this->clock)());
        return ['url' => $url, 'chapters' => $chapters, 'visibility' => $visibility, 'visibilityApplied' => false, 'note' => self::UPLOAD_NOTE];
    }

    public static function studyId(string $ref): ?string
    {
        $ref = trim($ref);
        if (preg_match('#^https?://(?:www\.)?lichess\.org/study/([A-Za-z0-9]{8})(?:[/?\#].*)?$#', $ref, $m)) {
            return $m[1];
        }
        return preg_match('/^[A-Za-z0-9]{8}$/', $ref) ? $ref : null;
    }

    /** @return array<string, mixed> */
    private function owned(int $id, ?int $userId, bool $isAdmin): array
    {
        $item = $this->repo->find($id) ?? throw new \OutOfBoundsException('generated PGN not found');
        $owner = $item['createdBy'] ?? null;
        if (!$isAdmin && ($owner === null || $owner !== $userId)) {
            throw new \DomainException('only the author or an admin can change this PGN');
        }
        return $item;
    }

    /** @return array<string, mixed> */
    private function game(mixed $g): array
    {
        if (!is_array($g) || array_is_list($g)) {
            throw new \InvalidArgumentException('every game must be an object');
        }
        $int = static function (mixed $v, string $name, int $min, int $max): int {
            if (!is_int($v) || $v < $min || $v > $max) {
                throw new \InvalidArgumentException("{$name} must be an integer between {$min} and {$max}");
            }
            return $v;
        };
        return [
            'book_id' => $int($g['bookId'] ?? null, 'bookId', 1, PHP_INT_MAX),
            'book_title' => $this->text($g['bookTitle'] ?? '', 'bookTitle', 300),
            'chapter' => $int($g['chapter'] ?? null, 'chapter', 1, 9999),
            'game_index' => $int($g['gameIndex'] ?? null, 'gameIndex', 0, 9999),
            'white' => $this->text($g['white'] ?? '', 'white', 200),
            'black' => $this->text($g['black'] ?? '', 'black', 200),
            'event' => $this->text($g['event'] ?? '', 'event', 200),
            'result' => $this->result($g['result'] ?? '*'),
            'pgn' => $this->pgn($g['pgn'] ?? null),
        ];
    }

    private function text(mixed $v, string $name, int $max): string
    {
        if (!is_string($v) || mb_strlen($v) > $max) {
            throw new \InvalidArgumentException("{$name} must be text of at most {$max} characters");
        }
        return trim($v);
    }

    private function result(mixed $v): string
    {
        if (!is_string($v) || !in_array($v, self::RESULTS, true)) {
            throw new \InvalidArgumentException('result must be 1-0, 0-1, 1/2-1/2 or *');
        }
        return $v;
    }

    private function pgn(mixed $v): string
    {
        if (!is_string($v) || trim($v) === '' || strlen($v) > self::MAX_PGN) {
            throw new \InvalidArgumentException('pgn must be text of 1 to ' . self::MAX_PGN . ' bytes');
        }
        return $v;
    }
}

<?php

declare(strict_types=1);

namespace App\Infrastructure\GeneratedPgn;

use App\Application\GeneratedPgn\GeneratedPgnRepository;
use Doctrine\DBAL\Connection;

/** The `generated_pgn` table (migration 013). */
final class DbalGeneratedPgnRepository implements GeneratedPgnRepository
{
    private const SUMMARY = 'id, book_id, book_title, chapter, game_index, white, black, event, result, status, created_by, created_at, updated_at, lichess_url';
    private const WRITABLE = ['book_id', 'book_title', 'chapter', 'game_index', 'white', 'black', 'event', 'result', 'pgn', 'status', 'lichess_url'];

    public function __construct(private readonly Connection $db)
    {
    }

    public function list(?int $bookId, ?string $status, ?string $q): array
    {
        $where = [];
        $params = [];
        if ($bookId !== null) {
            $where[] = 'book_id = ?';
            $params[] = $bookId;
        }
        if ($status !== null) {
            $where[] = 'status = ?';
            $params[] = $status;
        }
        if ($q !== null) {
            $where[] = "(instr(lower(white), lower(?)) > 0 OR instr(lower(black), lower(?)) > 0 OR instr(lower(event), lower(?)) > 0 OR instr(lower(book_title), lower(?)) > 0)";
            array_push($params, $q, $q, $q, $q);
        }
        $sql = 'SELECT ' . self::SUMMARY . ' FROM generated_pgn' . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where))
            . ' ORDER BY book_title COLLATE NOCASE, book_id, chapter, game_index, id';
        return array_map($this->hydrate(...), $this->db->fetchAllAssociative($sql, $params));
    }

    public function books(): array
    {
        $rows = $this->db->fetchAllAssociative('SELECT book_id, MAX(book_title) AS title, COUNT(*) AS n FROM generated_pgn GROUP BY book_id ORDER BY title COLLATE NOCASE');
        return array_map(fn (array $r): array => ['bookId' => (int) $r['book_id'], 'bookTitle' => (string) $r['title'], 'count' => (int) $r['n']], $rows);
    }

    public function find(int $id): ?array
    {
        $row = $this->db->fetchAssociative('SELECT ' . self::SUMMARY . ', pgn FROM generated_pgn WHERE id = ?', [$id]);
        return $row === false ? null : $this->hydrate($row) + ['pgn' => (string) $row['pgn']];
    }

    public function findByKey(int $bookId, int $chapter, int $gameIndex, ?int $createdBy): ?array
    {
        $row = $this->db->fetchAssociative(
            'SELECT ' . self::SUMMARY . ' FROM generated_pgn WHERE book_id = ? AND chapter = ? AND game_index = ? AND created_by IS ? ORDER BY id LIMIT 1',
            [$bookId, $chapter, $gameIndex, $createdBy],
        );
        return $row === false ? null : $this->hydrate($row);
    }

    public function insert(array $game, ?int $createdBy, string $now): int
    {
        $this->db->insert('generated_pgn', $this->only($game) + ['status' => 'new', 'created_by' => $createdBy, 'created_at' => $now, 'updated_at' => $now]);
        return (int) $this->db->lastInsertId();
    }

    public function update(int $id, array $fields, string $now): void
    {
        $this->db->update('generated_pgn', $this->only($fields) + ['updated_at' => $now], ['id' => $id]);
    }

    public function delete(int $id): void
    {
        $this->db->delete('generated_pgn', ['id' => $id]);
    }

    /** @param array<string, mixed> $fields @return array<string, mixed> */
    private function only(array $fields): array
    {
        return array_intersect_key($fields, array_flip(self::WRITABLE));
    }

    /** @param array<string, mixed> $r @return array<string, mixed> */
    private function hydrate(array $r): array
    {
        return [
            'id' => (int) $r['id'],
            'bookId' => (int) $r['book_id'],
            'bookTitle' => (string) $r['book_title'],
            'chapter' => (int) $r['chapter'],
            'gameIndex' => (int) $r['game_index'],
            'white' => (string) $r['white'],
            'black' => (string) $r['black'],
            'event' => (string) $r['event'],
            'result' => (string) $r['result'],
            'status' => (string) $r['status'],
            'createdBy' => $r['created_by'] === null ? null : (int) $r['created_by'],
            'createdAt' => (string) $r['created_at'],
            'updatedAt' => (string) $r['updated_at'],
            'lichessUrl' => $r['lichess_url'] === null ? null : (string) $r['lichess_url'],
        ];
    }
}

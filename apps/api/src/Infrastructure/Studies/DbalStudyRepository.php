<?php

declare(strict_types=1);

namespace App\Infrastructure\Studies;

use App\Domain\Studies\StudyRepository;
use Doctrine\DBAL\Connection;

/** Studies in the `studies` table (migration 011). */
final class DbalStudyRepository implements StudyRepository
{
    private const COLUMNS = 'id, name, author, chapters, games, comments, linked_ids, group_id, part_order, source, lichess_updated_at, imported_at, my_rating, lichess_likes, created_by';
    private const ORDER = [
        'name' => 'name COLLATE NOCASE',
        'author' => 'author COLLATE NOCASE',
        'rating' => 'my_rating',
        'likes' => 'lichess_likes',
        'updated' => 'lichess_updated_at',
        'imported' => 'imported_at',
    ];

    public function __construct(private readonly Connection $db)
    {
    }

    public function list(string $sort, string $dir, ?string $author, ?string $q): array
    {
        $column = self::ORDER[$sort] ?? throw new \InvalidArgumentException('unknown sort');
        $direction = $dir === 'desc' ? 'DESC' : 'ASC';
        $where = [];
        $params = [];
        if ($author !== null) {
            $where[] = 'author = ?';
            $params[] = $author;
        }
        if ($q !== null) {
            $where[] = "instr(lower(name), lower(?)) > 0";
            $params[] = $q;
        }
        $sql = 'SELECT ' . self::COLUMNS . ' FROM studies' . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where))
            // Missing values go last in both directions; ties fall back to the name.
            . " ORDER BY ({$column} IS NULL), {$column} {$direction}, name COLLATE NOCASE ASC, id ASC";
        return array_map($this->hydrate(...), $this->db->fetchAllAssociative($sql, $params));
    }

    public function authors(): array
    {
        $rows = $this->db->fetchAllAssociative('SELECT author, COUNT(*) AS n FROM studies WHERE author IS NOT NULL GROUP BY author ORDER BY author COLLATE NOCASE');
        return array_map(fn (array $r): array => ['author' => (string) $r['author'], 'count' => (int) $r['n']], $rows);
    }

    public function find(string $id): ?array
    {
        $row = $this->db->fetchAssociative('SELECT ' . self::COLUMNS . ' FROM studies WHERE id = ?', [$id]);
        return $row === false ? null : $this->hydrate($row);
    }

    public function pgn(string $id): ?string
    {
        $pgn = $this->db->fetchOne('SELECT pgn FROM studies WHERE id = ?', [$id]);
        return $pgn === false ? null : (string) $pgn;
    }

    public function ids(): array
    {
        return array_map('strval', $this->db->fetchFirstColumn('SELECT id FROM studies ORDER BY id'));
    }

    public function groupMembers(string $groupId): array
    {
        return array_map('strval', $this->db->fetchFirstColumn('SELECT id FROM studies WHERE group_id = ? ORDER BY part_order, id', [$groupId]));
    }

    public function save(array $info, string $pgn, string $source, ?string $groupId, ?int $partOrder, bool $setGroup, ?int $createdBy): void
    {
        $data = [
            'name' => $info['name'],
            'author' => $info['author'],
            'chapters' => $info['chapters'],
            'games' => $info['games'],
            'comments' => $info['comments'],
            'linked_ids' => json_encode($info['linkedIds'], JSON_UNESCAPED_SLASHES),
            'source' => $source,
            'lichess_updated_at' => $info['updatedAt'],
            'imported_at' => gmdate('Y-m-d\TH:i:s\Z'),
            'pgn' => $pgn,
        ];
        $this->db->transactional(function (Connection $db) use ($info, $data, $groupId, $partOrder, $setGroup, $createdBy): void {
            if ($db->fetchOne('SELECT 1 FROM studies WHERE id = ?', [$info['id']]) === false) {
                $db->insert('studies', $data + ['id' => $info['id'], 'group_id' => $groupId, 'part_order' => $partOrder, 'created_by' => $createdBy]);
                return;
            }
            if ($setGroup) {
                $data += ['group_id' => $groupId, 'part_order' => $partOrder];
            }
            $db->update('studies', $data, ['id' => $info['id']]);
        });
    }

    public function update(string $id, array $fields): void
    {
        $data = [];
        if (array_key_exists('myRating', $fields)) {
            $data['my_rating'] = $fields['myRating'];
        }
        if (array_key_exists('lichessLikes', $fields)) {
            $data['lichess_likes'] = $fields['lichessLikes'];
        }
        if ($data !== []) {
            $this->db->update('studies', $data, ['id' => $id]);
        }
    }

    public function delete(array $ids): int
    {
        $n = 0;
        foreach ($ids as $id) {
            $n += (int) $this->db->delete('studies', ['id' => $id]);
        }
        return $n;
    }

    /** @param array<string, mixed> $r */
    private function hydrate(array $r): array
    {
        $linked = json_decode((string) $r['linked_ids'], true);
        $linked = is_array($linked) ? array_values(array_map('strval', $linked)) : [];
        $groupId = $r['group_id'] !== null ? (string) $r['group_id'] : null;
        return [
            'id' => (string) $r['id'],
            'name' => (string) $r['name'],
            'author' => $r['author'] !== null ? (string) $r['author'] : null,
            'chapters' => (int) $r['chapters'],
            'games' => (int) $r['games'],
            'comments' => (int) $r['comments'],
            'linkedIds' => $linked,
            'groupId' => $groupId,
            'partOrder' => $r['part_order'] !== null ? (int) $r['part_order'] : null,
            'isBook' => $linked !== [] || $groupId !== null,
            'source' => (string) $r['source'],
            'updatedAt' => $r['lichess_updated_at'] !== null ? (string) $r['lichess_updated_at'] : null,
            'importedAt' => (string) $r['imported_at'],
            'myRating' => $r['my_rating'] !== null ? (int) $r['my_rating'] : null,
            'lichessLikes' => $r['lichess_likes'] !== null ? (int) $r['lichess_likes'] : null,
            'createdBy' => $r['created_by'] !== null ? (int) $r['created_by'] : null,
        ];
    }
}

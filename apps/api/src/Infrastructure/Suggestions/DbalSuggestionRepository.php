<?php

declare(strict_types=1);

namespace App\Infrastructure\Suggestions;

use App\Application\Errata\BookSlug;
use App\Application\Suggestions\SuggestionRepository;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;

/** Suggestions in the `suggestions` table (migration 007). */
final class DbalSuggestionRepository implements SuggestionRepository
{
    private const JSON = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

    public function __construct(
        private readonly Connection $connection,
        private readonly int $maxPerBook = 50000,
    ) {
    }

    public function create(array $suggestion, ?int $createdBy): void
    {
        $target = $suggestion['target'];
        $slug = BookSlug::of((string) $target['book']);
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $this->connection->transactional(function (Connection $db) use ($suggestion, $target, $slug, $now, $createdBy): void {
            if ($db->fetchOne('SELECT 1 FROM suggestions WHERE id = ?', [$suggestion['id']]) !== false) {
                throw new \DomainException('a suggestion with this id already exists');
            }
            $count = (int) $db->fetchOne('SELECT COUNT(*) FROM suggestions WHERE book_slug = ?', [$slug]);
            if ($count >= $this->maxPerBook) {
                throw new \OverflowException("the book already has {$this->maxPerBook} suggestions");
            }
            try {
                $db->insert('suggestions', [
                    'id' => $suggestion['id'],
                    'kind' => $suggestion['kind'],
                    'book_slug' => $slug,
                    'book_title' => $target['book'],
                    'chapter' => $target['chapter'] ?? null,
                    'game_index' => $target['gameIndex'] ?? null,
                    'target_json' => json_encode($target, self::JSON),
                    'before_json' => json_encode($suggestion['before'] ?? null, self::JSON),
                    'after_json' => json_encode($suggestion['after'], self::JSON),
                    'author' => $suggestion['author'],
                    'model' => $suggestion['model'] ?? null,
                    'status' => 'pending',
                    'created_at' => $suggestion['createdAt'],
                    'updated_at' => $now,
                    'created_by' => $createdBy,
                ]);
            } catch (UniqueConstraintViolationException) {
                throw new \DomainException('a suggestion with this id already exists');
            }
        });
    }

    public function get(string $id): ?array
    {
        $row = $this->connection->fetchAssociative('SELECT * FROM suggestions WHERE id = ?', [$id]);
        return $row === false ? null : $this->hydrate($row);
    }

    public function find(array $filter, int $offset, int $limit): array
    {
        $where = [];
        $params = [];
        foreach (['kind' => 'kind', 'book' => 'book_slug', 'status' => 'status', 'chapter' => 'chapter'] as $key => $column) {
            if (isset($filter[$key])) {
                $where[] = "{$column} = ?";
                $params[] = $filter[$key];
            }
        }
        $sql = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);
        $total = (int) $this->connection->fetchOne("SELECT COUNT(*) FROM suggestions{$sql}", $params);
        $rows = $this->connection->fetchAllAssociative(
            "SELECT * FROM suggestions{$sql} ORDER BY created_at ASC, id ASC LIMIT " . max(0, $limit) . ' OFFSET ' . max(0, $offset),
            $params,
        );
        return ['items' => array_map($this->hydrate(...), $rows), 'total' => $total];
    }

    public function setStatus(string $id, string $status): bool
    {
        return $this->connection->update(
            'suggestions',
            ['status' => $status, 'updated_at' => gmdate('Y-m-d\TH:i:s\Z')],
            ['id' => $id],
        ) > 0;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function hydrate(array $row): array
    {
        $s = [
            'id' => $row['id'],
            'kind' => $row['kind'],
            'target' => json_decode((string) $row['target_json'], true),
            'before' => json_decode((string) $row['before_json'], true),
            'after' => json_decode((string) $row['after_json'], true),
            'author' => $row['author'],
            'status' => $row['status'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'bookSlug' => $row['book_slug'],
            'createdBy' => $row['created_by'] === null ? null : (int) $row['created_by'],
        ];
        if ($row['model'] !== null) {
            $s['model'] = $row['model'];
        }
        return $s;
    }
}

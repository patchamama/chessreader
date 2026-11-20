<?php

declare(strict_types=1);

namespace App\Application\Suggestions;

/**
 * Where suggestions are kept. A stored suggestion is returned as the
 * validated shape plus bookSlug, updatedAt and createdBy.
 */
interface SuggestionRepository
{
    /**
     * Stores a validated suggestion as pending.
     *
     * @param array<string, mixed> $suggestion
     * @throws \DomainException when the id already exists
     * @throws \OverflowException when the book already has the maximum number of suggestions
     */
    public function create(array $suggestion, ?int $createdBy): void;

    /** @return array<string, mixed>|null */
    public function get(string $id): ?array;

    /**
     * @param array{kind?: string, book?: string, status?: string, chapter?: int} $filter book is a slug
     * @return array{items: list<array<string, mixed>>, total: int}
     */
    public function find(array $filter, int $offset, int $limit): array;

    /** False when there is no suggestion with this id. */
    public function setStatus(string $id, string $status): bool;
}

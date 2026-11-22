<?php

declare(strict_types=1);

namespace App\Application\Studies;

/** Where the studies come from (Lichess). */
interface LichessStudySource
{
    /** @throws LichessStudyException */
    public function exportPgn(string $id): string;

    /**
     * @return list<array{id: string, name: string, createdAt: ?string, updatedAt: ?string}>
     * @throws LichessStudyException
     */
    public function listUserStudies(string $handle): array;
}

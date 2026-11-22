<?php

declare(strict_types=1);

namespace App\Application\Studies;

/** Where the studies come from (Lichess). */
interface LichessStudySource
{
    /** @param ?string $token the user's own Lichess token, for this call only @throws LichessStudyException */
    public function exportPgn(string $id, ?string $token = null): string;

    /**
     * @return list<array{id: string, name: string, createdAt: ?string, updatedAt: ?string}>
     * @throws LichessStudyException
     */
    public function listUserStudies(string $handle, ?string $token = null): array;
}

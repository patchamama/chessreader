<?php

declare(strict_types=1);

namespace App\Application\GeneratedPgn;

use App\Application\Studies\LichessStudyException;

/** Imports a PGN into an EXISTING Lichess study (the public API cannot create studies). */
interface LichessStudyImporter
{
    /**
     * @return list<array{id: string, name: string}> the chapters Lichess created
     * @throws LichessStudyException
     * @throws \InvalidArgumentException on a malformed study id
     */
    public function importPgn(string $studyId, string $pgn, string $token): array;
}

<?php

declare(strict_types=1);

namespace App\Tests\Unit\Studies;

use App\Application\Studies\LichessStudySource;
use App\Application\Studies\LichessStudyException;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;

final class StudiesTestSupport
{
    /** A fresh in-memory database with the studies migration only. Never the real storage. */
    public static function connection(): Connection
    {
        $db = DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
        $db->executeStatement((string) file_get_contents(__DIR__ . '/../../../migrations/011_studies.sql'));
        return $db;
    }

    /** @param array<string, string|LichessStudyException> $studies id => PGN or failure */
    public static function source(array $studies): LichessStudySource
    {
        return new class ($studies) implements LichessStudySource {
            /** @var list<string> */
            public array $calls = [];
            /** @var list<?string> */
            public array $tokens = [];

            /** @param array<string, string|LichessStudyException> $studies */
            public function __construct(private array $studies)
            {
            }

            public function exportPgn(string $id, ?string $token = null): string
            {
                $this->calls[] = $id;
                $this->tokens[] = $token;
                $r = $this->studies[$id] ?? new LichessStudyException(404, "study {$id} not found");
                if ($r instanceof LichessStudyException) {
                    throw $r;
                }
                return $r;
            }

            public function listUserStudies(string $handle, ?string $token = null): array
            {
                $this->tokens[] = $token;
                return [['id' => 'AAAAAAAA', 'name' => 'One', 'createdAt' => '2024-01-01T00:00:00Z', 'updatedAt' => '2024-01-02T00:00:00Z']];
            }
        };
    }
}

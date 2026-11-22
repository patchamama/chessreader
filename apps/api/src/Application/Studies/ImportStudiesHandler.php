<?php

declare(strict_types=1);

namespace App\Application\Studies;

use App\Domain\Studies\StudyRepository;

/** Imports a Lichess study, optionally with the studies its comments link to (a book made of parts). */
final class ImportStudiesHandler
{
    public const MAX_DEPTH = 6;
    public const MAX_STUDIES = 200;
    public const MAX_PARTS = 50;

    public function __construct(
        private readonly LichessStudySource $source,
        private readonly StudyRepository $studies,
        private readonly StudyPgnParser $parser,
    ) {
    }

    /**
     * @param list<string> $parts extra study refs appended to the group
     * @return array{imported: list<array<string, mixed>>, skipped: list<array{id: string, reason: string}>, linked: list<string>, errors: list<array<string, mixed>>, warnings: list<array{id: string, message: string}>}
     * @throws \InvalidArgumentException when a reference is not a study
     */
    public function handle(string $ref, bool $follow, int $depth, int $max, array $parts, ?int $userId, ?string $token = null): array
    {
        $root = StudyRef::id($ref) ?? throw new \InvalidArgumentException('ref must be a Lichess study URL or an 8-character study id');
        $partIds = [];
        foreach ($parts as $part) {
            $id = is_string($part) ? StudyRef::id($part) : null;
            if ($id === null) {
                throw new \InvalidArgumentException('every part must be a Lichess study URL or an 8-character study id');
            }
            $partIds[] = $id;
        }
        if (count($partIds) > self::MAX_PARTS) {
            throw new \InvalidArgumentException('too many parts (at most ' . self::MAX_PARTS . ')');
        }
        $depth = max(0, min(self::MAX_DEPTH, $depth));
        $max = max(1, min(self::MAX_STUDIES, $max));

        $grouped = $follow || $partIds !== [];
        $imported = [];
        $skipped = [];
        $errors = [];
        $linked = [];
        $warnings = [];
        $seen = [$root => true];
        $queue = [[$root, 0]];
        foreach ($partIds as $p) {
            if (!isset($seen[$p])) {
                $seen[$p] = true;
                $queue[] = [$p, -1]; // explicit part: not expanded, not bounded by depth
            }
        }

        $order = 0;
        $stopped = false;
        for ($i = 0; $i < count($queue); $i++) {
            [$id, $level] = $queue[$i];
            if ($stopped) {
                $skipped[] = ['id' => $id, 'reason' => 'not imported: Lichess rate limit'];
                continue;
            }
            if ($level >= 0 && count($imported) >= $max) {
                $skipped[] = ['id' => $id, 'reason' => "not imported: the limit of {$max} studies was reached"];
                continue;
            }
            // Each study gets a fresh PHP time budget: a big export must not end in an HTML fatal.
            if (function_exists('set_time_limit')) {
                @set_time_limit(300);
            }
            try {
                $pgn = $this->source->exportPgn($id, $token);
                $info = $this->parser->parse($pgn, $id);
            } catch (LichessStudyException $e) {
                $errors[] = ['id' => $id, 'message' => $e->getMessage()]
                    + ($e->retryAfter !== null ? ['retryAfter' => $e->retryAfter] : [])
                    + ($e->needsToken ? ['needsToken' => true] : []);
                $stopped = $e->status === 429;
                continue;
            } catch (\Throwable $e) {
                error_log('study import failed for ' . $id . ': ' . get_class($e));
                $errors[] = ['id' => $id, 'message' => "could not import study {$id}"];
                continue;
            }
            if ($info['author'] === null) {
                $warnings[] = ['id' => $id, 'message' => 'the study has no Annotator header: its author is unknown'];
            }
            $order++;
            $this->studies->save($info, $pgn, 'lichess', $grouped ? $root : null, $grouped ? $order : null, $grouped, $userId);
            $imported[] = $id;
            if ($level >= 0) {
                foreach ($info['linkedIds'] as $next) {
                    $linked[$next] = true;
                    if (!$follow || isset($seen[$next])) {
                        continue;
                    }
                    if ($level + 1 > $depth) {
                        $skipped[] = ['id' => $next, 'reason' => "not imported: deeper than {$depth} levels"];
                        $seen[$next] = true;
                        continue;
                    }
                    $seen[$next] = true;
                    $queue[] = [$next, $level + 1];
                }
            }
        }

        // A lone study is not a group.
        if ($grouped && count($imported) === 1) {
            $only = $imported[0];
            $info = $this->studies->find($only);
            if ($info !== null) {
                $this->studies->save([
                    'id' => $only, 'name' => $info['name'], 'author' => $info['author'], 'chapters' => $info['chapters'], 'games' => $info['games'],
                    'comments' => $info['comments'], 'linkedIds' => $info['linkedIds'], 'updatedAt' => $info['updatedAt'],
                ], (string) $this->studies->pgn($only), 'lichess', null, null, true, $userId);
            }
        }

        $studies = [];
        foreach ($imported as $id) {
            $row = $this->studies->find($id);
            if ($row !== null) {
                unset($row['createdBy']);
                $studies[] = $row;
            }
        }
        return ['imported' => $studies, 'skipped' => $skipped, 'linked' => array_keys($linked), 'errors' => $errors, 'warnings' => $warnings];
    }
}

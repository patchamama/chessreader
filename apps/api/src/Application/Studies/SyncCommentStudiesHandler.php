<?php

declare(strict_types=1);

namespace App\Application\Studies;

use App\Domain\Studies\StudyRepository;

/** Lists, as studies, the Lichess chapters of the commentary database. Never overwrites an imported study. */
final class SyncCommentStudiesHandler
{
    public function __construct(
        private readonly CommentChapterSource $chapters,
        private readonly StudyRepository $studies,
        private readonly StudyPgnParser $parser,
    ) {
    }

    /** @return array{added: int, studies: int} */
    public function handle(): array
    {
        /** @var array<string, list<string>> $byStudy */
        $byStudy = [];
        foreach ($this->chapters->lichessChapterPgns() as $pgn) {
            if (preg_match('#lichess\.org/study/(' . StudyRef::ID . ')(?![A-Za-z0-9])#', $pgn, $m)) {
                $byStudy[$m[1]][] = $pgn;
            }
        }
        $added = 0;
        foreach ($byStudy as $id => $pgns) {
            $existing = $this->studies->find((string) $id);
            if ($existing !== null && $existing['source'] === 'lichess') {
                continue;
            }
            $pgn = implode("\n\n", $pgns);
            $this->studies->save($this->parser->parse($pgn, (string) $id), $pgn, 'comments', $existing['groupId'] ?? null, $existing['partOrder'] ?? null, false, null);
            if ($existing === null) {
                $added++;
            }
        }
        return ['added' => $added, 'studies' => count($byStudy)];
    }
}

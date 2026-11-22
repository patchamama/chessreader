<?php

declare(strict_types=1);

namespace App\Application\Studies;

/** Reads the facts the library needs from the PGN of a whole Lichess study. Pure. */
final class StudyPgnParser
{
    /**
     * @return array{id: string, name: string, author: ?string, chapters: int, games: int, comments: int, linkedIds: list<string>, chapterUrls: list<string>, updatedAt: ?string}
     */
    public function parse(string $pgn, string $id): array
    {
        $chapters = (int) preg_match_all('/^\[Event "/m', $pgn);
        $name = preg_match('/^\[StudyName "([^"]*)"\]/m', $pgn, $m) ? trim($m[1]) : '';

        $authors = [];
        if (preg_match_all('#^\[Annotator "https?://lichess\.org/@/([^"/]+)"\]#m', $pgn, $m)) {
            $authors = array_count_values($m[1]);
            arsort($authors);
        }

        $chapterUrls = preg_match_all('/^\[ChapterURL "([^"]+)"\]/m', $pgn, $m) ? $m[1] : [];

        $links = [];
        $commentCount = 0;
        if (preg_match_all('/\{[^}]*\}/s', $pgn, $blocks)) {
            $commentCount = count($blocks[0]);
            foreach ($blocks[0] as $block) {
                if (preg_match_all('#lichess\.org/study/(' . StudyRef::ID . ')(?![A-Za-z0-9])#', $block, $found)) {
                    foreach ($found[1] as $linked) {
                        if ($linked !== $id) {
                            $links[$linked] = true;
                        }
                    }
                }
            }
        }

        $updated = null;
        if (preg_match_all('/^\[UTCDate "(\d{4})\.(\d{2})\.(\d{2})"\]/m', $pgn, $m, PREG_SET_ORDER)) {
            $dates = array_map(fn (array $d): string => "{$d[1]}-{$d[2]}-{$d[3]}T00:00:00Z", $m);
            sort($dates);
            $updated = end($dates);
        }

        return [
            'id' => $id,
            'name' => $name !== '' ? $name : $id,
            'author' => $authors === [] ? null : (string) array_key_first($authors),
            'chapters' => $chapters,
            'games' => $chapters,
            'comments' => $commentCount,
            'linkedIds' => array_map('strval', array_keys($links)),
            'chapterUrls' => $chapterUrls,
            'updatedAt' => $updated,
        ];
    }
}

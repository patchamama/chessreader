<?php

declare(strict_types=1);

namespace App\Tests\Unit\Studies;

/** Invented tiny study PGNs (never real study text). */
final class StudyFixtures
{
    /**
     * @param list<string> $chapterComments one comment per chapter
     */
    public static function pgn(string $id, string $name, string $handle, array $chapterComments): string
    {
        $out = [];
        foreach ($chapterComments as $i => $comment) {
            $n = $i + 1;
            $out[] = "[Event \"{$name}: Chapter {$n}\"]\n[Site \"https://lichess.org/study/{$id}/chap000{$n}\"]\n"
                . "[StudyName \"{$name}\"]\n[ChapterName \"Chapter {$n}\"]\n[ChapterURL \"https://lichess.org/study/{$id}/chap000{$n}\"]\n"
                . "[Annotator \"https://lichess.org/@/{$handle}\"]\n[UTCDate \"2024.0{$n}.15\"]\n\n"
                . "1. e4 { {$comment} } e5 2. Nf3 *\n";
        }
        return implode("\n", $out);
    }
}

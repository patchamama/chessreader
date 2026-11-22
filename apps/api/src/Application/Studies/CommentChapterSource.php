<?php

declare(strict_types=1);

namespace App\Application\Studies;

/** The Lichess chapters already kept in the commentary database. */
interface CommentChapterSource
{
    /** @return iterable<string> one PGN per chapter */
    public function lichessChapterPgns(): iterable;
}

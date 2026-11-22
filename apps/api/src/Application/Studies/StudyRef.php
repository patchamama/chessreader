<?php

declare(strict_types=1);

namespace App\Application\Studies;

/** A study reference typed by the user: a Lichess study URL (with or without chapter) or a bare id. */
final class StudyRef
{
    public const ID = '[A-Za-z0-9]{8}';

    public static function id(string $ref): ?string
    {
        $ref = trim($ref);
        if (preg_match('/^' . self::ID . '$/', $ref)) {
            return $ref;
        }
        if (preg_match('#^(?:https?://)?(?:www\.)?lichess\.org/study/(' . self::ID . ')(?:[/?\#].*)?$#', $ref, $m)) {
            return $m[1];
        }
        return null;
    }
}

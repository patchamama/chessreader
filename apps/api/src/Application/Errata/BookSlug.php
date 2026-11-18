<?php

declare(strict_types=1);

namespace App\Application\Errata;

/**
 * The folder name of a book in the errata store: lowercase ASCII letters,
 * digits and single dashes, at most 80 characters. Accented Latin letters are
 * transliterated with a fixed table (the web client uses the same table, so
 * both sides compute the same slug); anything else becomes a dash. The result
 * can never contain a dot or a slash, so it can never leave the errata folder.
 */
final class BookSlug
{
    private const MAP = [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ä' => 'a', 'ã' => 'a', 'å' => 'a',
        'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'ö' => 'o', 'õ' => 'o', 'ø' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
        'ñ' => 'n', 'ç' => 'c', 'ý' => 'y', 'ÿ' => 'y',
        'ß' => 'ss', 'æ' => 'ae', 'œ' => 'oe',
    ];

    public static function of(string $title): string
    {
        $s = strtr(mb_strtolower($title, 'UTF-8'), self::MAP);
        $s = trim((string) preg_replace('/[^a-z0-9]+/', '-', $s), '-');
        return rtrim(substr($s, 0, 80), '-');
    }
}

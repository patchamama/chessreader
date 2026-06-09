<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Recognition;

/**
 * Normalises Spanish chess SAN notation to English.
 *
 * Mapping:
 *  C -> N (Caballo / Knight)
 *  A -> B (Alfil / Bishop)
 *  D -> Q (Dama / Queen)
 *  T -> R (Torre / Rook)  — processed BEFORE R->K to avoid clobbering
 *  R -> K (Rey / King)
 *
 * Also normalises:
 *  - Castling: 0-0 -> O-O, 0-0-0 -> O-O-O
 *  - Ellipsis: … -> ...
 */
final class SpanishNotationNormalizer
{
    /**
     * Normalises a single SAN token.
     */
    public function normalizeToken(string $token): string
    {
        // Castling normalisation
        if ($token === '0-0-0') {
            return 'O-O-O';
        }
        if ($token === '0-0') {
            return 'O-O';
        }
        if ($token === 'O-O-O' || $token === 'O-O') {
            return $token;
        }

        // Use placeholder for T (Rook) to avoid R->K clobbering
        $result = preg_replace('/^T/', '__ROOK__', $token);
        $result = preg_replace('/^C/', 'N', $result);
        $result = preg_replace('/^A/', 'B', $result);
        $result = preg_replace('/^D/', 'Q', $result);
        $result = preg_replace('/^R/', 'K', $result);
        $result = str_replace('__ROOK__', 'R', $result);

        return $result;
    }

    /**
     * Normalises a full text string with Spanish notation.
     */
    public function normalizeText(string $text): string
    {
        // Ellipsis normalisation
        $result = str_replace('…', '...', $text);
        $result = str_replace('&#8230;', '...', $result);

        // Castling normalisation (word-bounded)
        $result = preg_replace('/\b0-0-0\b/', 'O-O-O', $result);
        $result = preg_replace('/\b0-0\b/', 'O-O', $result);

        // Replace Spanish piece letters at the start of SAN tokens.
        // A token starts after space, (, or beginning of string.
        // Use placeholder for T (Torre/Rook) first to prevent R->K overwrite.
        $result = preg_replace('/(?<=^|[ (])T(?=[a-h1-8x+#=?!])/', "\x00ROOK\x00", $result);
        $result = preg_replace('/(?<=^|[ (])C(?=[a-h1-8x+#=?!])/', 'N', $result);
        $result = preg_replace('/(?<=^|[ (])A(?=[a-h1-8x+#=?!])/', 'B', $result);
        $result = preg_replace('/(?<=^|[ (])D(?=[a-h1-8x+#=?!])/', 'Q', $result);
        $result = preg_replace('/(?<=^|[ (])R(?=[a-h1-8x+#=?!])/', 'K', $result);
        $result = str_replace("\x00ROOK\x00", 'R', $result);

        return $result;
    }
}

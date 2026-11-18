<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/**
 * A table-of-contents label that may span several lines ("Capítulo I" /
 * "CELADAS CON CEBO"): the lines are kept, joined with " — ", so the reader's
 * TOC shows the whole title on one entry.
 */
final class TocLabel
{
    public const SEPARATOR = ' — ';

    /** @param list<string> $lines */
    public static function fromLines(array $lines): string
    {
        $clean = [];
        foreach ($lines as $line) {
            $line = trim((string) preg_replace('/\s+/u', ' ', $line));
            if ($line !== '') {
                $clean[] = $line;
            }
        }
        return implode(self::SEPARATOR, $clean);
    }

    public static function fromText(string $text): string
    {
        return self::fromLines(preg_split('/\R/u', $text) ?: []);
    }

    /**
     * Text of an element with every <br> as a line break.
     *
     * @return list<string>
     */
    public static function linesOf(\DOMNode $node): array
    {
        $buffer = '';
        $walk = function (\DOMNode $n) use (&$walk, &$buffer): void {
            foreach ($n->childNodes as $child) {
                if ($child instanceof \DOMElement && strtolower($child->localName ?? '') === 'br') {
                    $buffer .= "\n";
                } elseif ($child instanceof \DOMText) {
                    // Source line breaks inside a text node are just whitespace.
                    $buffer .= (string) preg_replace('/\s+/u', ' ', $child->data);
                } else {
                    $walk($child);
                }
            }
        };
        $walk($node);
        $lines = [];
        foreach (explode("\n", $buffer) as $line) {
            $line = trim((string) preg_replace('/\s+/u', ' ', $line));
            if ($line !== '') {
                $lines[] = $line;
            }
        }
        return $lines;
    }

    /** Same words, ignoring case and spacing. */
    public static function sameWords(string $a, string $b): bool
    {
        $norm = fn(string $s) => mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $s)));
        return $norm($a) === $norm($b);
    }
}

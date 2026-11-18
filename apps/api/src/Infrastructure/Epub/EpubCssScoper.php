<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/**
 * Rewrites an EPUB stylesheet so it only applies inside the reader's content:
 * every selector is prefixed with `:where(.epub-content)` (zero specificity, so
 * the reader's own per-book settings still win), `html`/`body` become the
 * content root, and what cannot work outside the EPUB (imports, fonts, url()
 * references) is dropped.
 */
final class EpubCssScoper
{
    public const SCOPE = ':where(.epub-content)';

    public function scope(string $css, string $scope = self::SCOPE): string
    {
        $css = (string) preg_replace('~/\*.*?\*/~s', '', $css);
        $css = (string) preg_replace('/@(?:charset|import|namespace)\b[^;]*;/i', '', $css);
        $out = $this->rules($css, $scope);
        // The CSS ends up inside a <style> element: it must not be able to close it.
        return (string) preg_replace('~<(?=/?\s*style)~i', '\\3C ', $out);
    }

    private function rules(string $css, string $scope): string
    {
        $out = [];
        $len = strlen($css);
        $i   = 0;
        while ($i < $len) {
            $open = strpos($css, '{', $i);
            if ($open === false) {
                break;
            }
            $prelude = trim(substr($css, $i, $open - $i));
            $close   = $this->matchingBrace($css, $open);
            $body    = substr($css, $open + 1, $close - $open - 1);
            $i       = $close + 1;

            if (str_starts_with($prelude, '@')) {
                if (preg_match('/^@(?:media|supports)\b/i', $prelude)) {
                    $inner = $this->rules($body, $scope);
                    if ($inner !== '') {
                        $out[] = $prelude . " {\n" . $inner . "\n}";
                    }
                }
                // @font-face, @page, @keyframes… do not apply to the reader.
                continue;
            }
            $declarations = $this->declarations($body);
            if ($prelude === '' || $declarations === '') {
                continue;
            }
            $selectors = array_map(fn(string $s) => $this->selector(trim($s), $scope), explode(',', $prelude));
            $out[] = implode(', ', $selectors) . ' {' . $declarations . '}';
        }
        return implode("\n", $out);
    }

    private function matchingBrace(string $css, int $open): int
    {
        $depth = 0;
        $len   = strlen($css);
        for ($j = $open; $j < $len; $j++) {
            if ($css[$j] === '{') {
                $depth++;
            } elseif ($css[$j] === '}') {
                $depth--;
                if ($depth === 0) {
                    return $j;
                }
            }
        }
        return $len;
    }

    private function declarations(string $body): string
    {
        $kept = [];
        foreach (explode(';', $body) as $decl) {
            $decl = trim($decl);
            if ($decl === '' || stripos($decl, 'url(') !== false || stripos($decl, 'expression(') !== false) {
                continue;
            }
            $kept[] = $decl;
        }
        return implode('; ', $kept);
    }

    private function selector(string $selector, string $scope): string
    {
        // html / body (alone or as the first compound) are the content root.
        $rest = (string) preg_replace('/^(?:html\b[^\s>+~]*\s*)?(?:body\b[^\s>+~]*)?\s*/i', '', $selector, 1);
        if ($rest !== $selector) {
            return $rest === '' ? $scope : $scope . ' ' . $rest;
        }
        return $scope . ' ' . $selector;
    }
}

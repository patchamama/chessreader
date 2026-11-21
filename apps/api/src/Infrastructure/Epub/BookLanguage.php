<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/**
 * The language of a book as a lowercase 2-letter code ("en", "es"…), or ''
 * when unknown: from the OPF's dc:language, else guessed from the text.
 */
final class BookLanguage
{
    /** ISO 639-2 (and the common 639-2/B variants) → ISO 639-1. */
    private const THREE_LETTER = [
        'eng' => 'en', 'spa' => 'es', 'fre' => 'fr', 'fra' => 'fr', 'ger' => 'de', 'deu' => 'de',
        'ita' => 'it', 'por' => 'pt', 'rus' => 'ru', 'dut' => 'nl', 'nld' => 'nl', 'pol' => 'pl',
        'cze' => 'cs', 'ces' => 'cs', 'swe' => 'sv', 'dan' => 'da', 'nor' => 'no', 'fin' => 'fi',
        'hun' => 'hu', 'tur' => 'tr', 'lat' => 'la', 'gre' => 'el', 'ell' => 'el', 'ukr' => 'uk',
        'jpn' => 'ja', 'chi' => 'zh', 'zho' => 'zh', 'cat' => 'ca', 'heb' => 'he', 'ara' => 'ar',
        'hrv' => 'hr', 'srp' => 'sr', 'bul' => 'bg', 'ron' => 'ro', 'rum' => 'ro', 'slv' => 'sl',
        'slk' => 'sk', 'slo' => 'sk',
    ];

    /** Frequent function words per language (a small stop-word heuristic). */
    private const STOP_WORDS = [
        'en' => ['the', 'and', 'of', 'to', 'is', 'in', 'that', 'it', 'was', 'for', 'with', 'as', 'his', 'are', 'by', 'this', 'which', 'be', 'but', 'not', 'from', 'has', 'have', 'they', 'on', 'at', 'an', 'he', 'white', 'black'],
        'es' => ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'por', 'con', 'para', 'es', 'se', 'del', 'al', 'lo', 'como', 'más', 'pero', 'su', 'sus', 'está', 'son', 'blancas', 'negras'],
        'de' => ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'zu', 'den', 'dem', 'mit', 'von', 'auf', 'für', 'sich', 'des', 'im', 'auch', 'wird', 'dass', 'als', 'weiß', 'schwarz'],
        'fr' => ['le', 'la', 'les', 'des', 'du', 'et', 'est', 'un', 'une', 'que', 'qui', 'dans', 'pour', 'pas', 'sur', 'au', 'avec', 'ce', 'se', 'il', 'ne', 'ou', 'par', 'blancs', 'noirs'],
        'it' => ['il', 'lo', 'la', 'le', 'gli', 'di', 'che', 'è', 'e', 'un', 'una', 'per', 'con', 'non', 'sono', 'del', 'della', 'nel', 'si', 'come', 'più', 'ma', 'bianco', 'nero'],
        'pt' => ['o', 'a', 'os', 'as', 'de', 'que', 'e', 'em', 'um', 'uma', 'para', 'com', 'não', 'do', 'da', 'dos', 'é', 'se', 'mais', 'por', 'como', 'na', 'no', 'ao', 'brancas', 'pretas'],
    ];

    private const MIN_HITS = 5;
    private const MIN_RATIO = 1.5;
    private const SAMPLE_CHARS = 30000;

    /** "en-US", "eng", "es_ES"… → "en", "en", "es"; '' when not a language code. */
    public static function normalize(string $raw): string
    {
        $primary = strtolower(trim((string) preg_split('/[-_]/', trim($raw), 2)[0]));
        if (preg_match('/^[a-z]{2}$/', $primary) === 1) {
            return $primary;
        }
        return self::THREE_LETTER[$primary] ?? '';
    }

    /** Guesses the language of some text (HTML allowed); '' when unsure. */
    public static function detect(string $text): string
    {
        $text = preg_replace('~<(script|style)\b.*?</\1\s*>~is', ' ', $text) ?? $text;
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = mb_strtolower(mb_substr($text, 0, self::SAMPLE_CHARS));
        if (preg_match_all('/\p{L}+/u', $text, $m) === 0) {
            return '';
        }
        $counts = array_count_values($m[0]);

        $scores = [];
        foreach (self::STOP_WORDS as $lang => $words) {
            $scores[$lang] = 0;
            foreach ($words as $word) {
                $scores[$lang] += $counts[$word] ?? 0;
            }
        }
        arsort($scores);
        $best   = (int) reset($scores);
        $second = (int) (array_values($scores)[1] ?? 0);
        if ($best < self::MIN_HITS || $best < $second * self::MIN_RATIO) {
            return '';
        }
        return (string) array_key_first($scores);
    }

    /**
     * The OPF's language when it names one, else a guess from the first chapters.
     *
     * @param iterable<string> $chapterHtml chapters in reading order (read lazily)
     */
    public static function resolve(string $opfLanguage, iterable $chapterHtml): string
    {
        $code = self::normalize($opfLanguage);
        if ($code !== '') {
            return $code;
        }
        $sample = '';
        foreach ($chapterHtml as $html) {
            $sample .= ' ' . $html;
            if (strlen($sample) >= self::SAMPLE_CHARS * 2) {
                break;
            }
        }
        return self::detect($sample);
    }

    /** The language of a stored EPUB file; '' when it cannot be read. */
    public static function fromEpubFile(string $path): string
    {
        if (!is_file($path)) {
            return '';
        }
        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            return '';
        }
        try {
            $package = EpubPackage::fromZip($zip);
            $opfPath = $package->opfPath();
            $xml     = $opfPath !== null ? $zip->getFromName($opfPath) : false;
            $opfLang = '';
            if ($xml !== false) {
                try {
                    $opfLang = (new OpfManifestParser())->parseXml($xml)['language'];
                } catch (\RuntimeException) {
                    $opfLang = '';
                }
            }
            return self::resolve($opfLang, self::firstChapters($package));
        } catch (\Throwable) {
            return '';
        } finally {
            $zip->close();
        }
    }

    /** @return \Generator<string> */
    private static function firstChapters(EpubPackage $package): \Generator
    {
        foreach (array_slice($package->chapters(), 0, 8) as $chapter) {
            yield $chapter['html'];
        }
    }
}

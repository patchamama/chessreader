<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/**
 * One EPUB read through its own metadata, from an extracted directory or
 * straight from the ZIP: the spine chapters named by the book's table of
 * contents, and the cover image the metadata declares.
 *
 * All paths are archive paths ("OEBPS/Text/c1.xhtml"), resolved and normalised.
 */
final class EpubPackage
{
    /** @var \Closure(string):?string */
    private \Closure $read;

    /** @var array<string,mixed>|null */
    private ?array $opf = null;
    private ?string $opfPath = null;
    private ?string $fallbackOpf = null;

    /** @param callable(string):?string $read archive path → contents, null when missing */
    public function __construct(
        callable $read,
        private readonly OpfManifestParser $opfParser = new OpfManifestParser(),
        private readonly NcxTocParser $ncxParser = new NcxTocParser(),
        private readonly NavTocParser $navParser = new NavTocParser(),
    ) {
        $this->read = \Closure::fromCallable($read);
    }

    public static function fromDirectory(
        string $dir,
        OpfManifestParser $opfParser = new OpfManifestParser(),
        NcxTocParser $ncxParser = new NcxTocParser(),
    ): self {
        $root = rtrim($dir, '/');
        return new self(
            static function (string $path) use ($root): ?string {
                $file = $root . '/' . $path;
                if (!is_file($file)) {
                    return null;
                }
                $data = file_get_contents($file);
                return $data === false ? null : $data;
            },
            $opfParser,
            $ncxParser,
        );
    }

    public static function fromZip(\ZipArchive $zip): self
    {
        return new self(static function (string $path) use ($zip): ?string {
            $data = $zip->getFromName($path);
            return $data === false ? null : $data;
        });
    }

    /** Use this OPF when container.xml does not name one (archive path). */
    public function withFallbackOpf(string $archivePath): self
    {
        $copy = clone $this;
        $copy->fallbackOpf = $this->normalize($archivePath);
        $copy->opf = null;
        return $copy;
    }

    /** Archive path of the OPF (container.xml rootfile), or null. */
    public function opfPath(): ?string
    {
        $this->load();
        return $this->opfPath;
    }

    /**
     * Spine documents in reading order, each named from the table of contents.
     *
     * @return list<array{path:string,title:string,html:string}>
     */
    public function chapters(): array
    {
        $opf = $this->load();
        if ($opf === null) {
            return [];
        }
        $toc = $this->tocTitles($opf);

        $chapters = [];
        // A part with no TOC entry and no heading continues the chapter before it: "Capítulo I (2)".
        $parent = null;
        $part = 1;
        foreach ($opf['spine'] as $idref) {
            $href = $opf['manifest'][$idref] ?? null;
            if ($href === null) {
                continue;
            }
            $path  = $this->resolve($this->opfDir(), $href);
            $html  = ($this->read)($path) ?? '';
            $lines = $this->headingLines($html);
            $label = $toc[$path] ?? null;

            if ($label !== null && $label !== '') {
                // The TOC label printed on one line while the chapter heading
                // breaks it into lines: keep the heading's lines.
                $title = (count($lines) > 1 && TocLabel::sameWords(implode(' ', $lines), str_replace(TocLabel::SEPARATOR, ' ', $label)))
                    ? TocLabel::fromLines($lines)
                    : $label;
            } elseif ($lines !== []) {
                $title = TocLabel::fromLines($lines);
            } elseif ($parent !== null) {
                $title = $parent . ' (' . (++$part) . ')';
            } else {
                // Front matter before any named chapter (cover, title page).
                $title = 'Chapter ' . (count($chapters) + 1);
            }
            if (($label !== null && $label !== '') || $lines !== []) {
                $parent = $title;
                $part = 1;
            }

            $chapters[] = ['path' => $path, 'title' => $title, 'html' => $html];
        }
        return $chapters;
    }

    /**
     * CSS of the stylesheets the N-th spine document (1-based) links, in order.
     *
     * @return list<string>
     */
    public function chapterStylesheets(int $order): array
    {
        $opf = $this->load();
        if ($opf === null || $order < 1) {
            return [];
        }
        $idref = $opf['spine'][$order - 1] ?? null;
        $href  = $idref !== null ? ($opf['manifest'][$idref] ?? null) : null;
        if ($href === null) {
            return [];
        }
        $path = $this->resolve($this->opfDir(), $href);
        $html = ($this->read)($path) ?? '';
        // Only the <head> holds the links; the (often large) body is not parsed.
        $head = preg_match('~<head\b.*?</head\s*>~is', $html, $m) ? $m[0] : '';

        $sheets = [];
        preg_match_all('~<link\b[^>]*>~i', $head, $links);
        foreach ($links[0] as $link) {
            if (!preg_match('~\brel\s*=\s*["\']?[^"\'>]*stylesheet~i', $link)
                || !preg_match('~\bhref\s*=\s*["\']([^"\']+)["\']~i', $link, $h)
                || preg_match('~^[a-z][a-z0-9+.-]*:~i', $h[1])) {
                continue;
            }
            $css = ($this->read)($this->resolve(dirname($path), $h[1]));
            if ($css !== null && $css !== '') {
                $sheets[] = $css;
            }
        }
        // Styles written in the document head itself.
        preg_match_all('~<style\b[^>]*>(.*?)</style\s*>~is', $head, $styles);
        foreach ($styles[1] as $css) {
            if (trim($css) !== '') {
                $sheets[] = $css;
            }
        }
        return $sheets;
    }

    /**
     * Archive path of the cover image: EPUB 3 cover-image property, EPUB 2
     * <meta name="cover">, the <guide> cover page's image, then the first image.
     */
    public function coverPath(): ?string
    {
        $opf = $this->load();
        if ($opf === null) {
            return null;
        }
        if ($opf['coverImage'] !== null) {
            return $this->resolve($this->opfDir(), $opf['coverImage']);
        }
        if ($opf['coverPage'] !== null) {
            $page    = $this->resolve($this->opfDir(), $opf['coverPage']);
            $pageSrc = $this->firstImageSrc(($this->read)($page) ?? '');
            if ($pageSrc !== null) {
                return $this->resolve(dirname($page), $pageSrc);
            }
        }
        return $opf['cover'] !== null ? $this->resolve($this->opfDir(), $opf['cover']) : null;
    }

    /** @return array<string,mixed>|null */
    private function load(): ?array
    {
        if ($this->opf !== null) {
            return $this->opf;
        }
        $container = ($this->read)('META-INF/container.xml');
        if ($container !== null) {
            $dom = new \DOMDocument();
            if (@$dom->loadXML($container)) {
                $root = $dom->getElementsByTagName('rootfile')->item(0);
                if ($root instanceof \DOMElement && $root->getAttribute('full-path') !== '') {
                    $this->opfPath = $this->normalize($root->getAttribute('full-path'));
                }
            }
        }
        $this->opfPath ??= $this->fallbackOpf;
        if ($this->opfPath === null) {
            return null;
        }
        $xml = ($this->read)($this->opfPath);
        if ($xml === null) {
            return null;
        }
        try {
            $this->opf = $this->opfParser->parseXml($xml);
        } catch (\RuntimeException) {
            return null;
        }
        return $this->opf;
    }

    /**
     * Archive path → title of the first TOC entry pointing at it.
     *
     * @param array<string,mixed> $opf
     * @return array<string,string>
     */
    private function tocTitles(array $opf): array
    {
        $entries = [];
        $tocPath = null;
        try {
            if ($opf['nav'] !== null) {
                $tocPath = $this->resolve($this->opfDir(), $opf['nav']);
                $xml     = ($this->read)($tocPath);
                $entries = $xml !== null ? $this->navParser->parseXml($xml) : [];
            }
            if ($entries === []) {
                $tocPath = $this->resolve($this->opfDir(), $opf['ncx'] ?? ($opf['manifest']['ncx'] ?? 'toc.ncx'));
                $xml     = ($this->read)($tocPath);
                $entries = $xml !== null ? $this->ncxParser->parseXml($xml) : [];
            }
        } catch (\RuntimeException) {
            $entries = [];
        }

        $titles = [];
        foreach ($entries as $entry) {
            if ($entry->href === '' || $tocPath === null) {
                continue;
            }
            // TOC hrefs are relative to the TOC document itself.
            $path = $this->resolve(dirname($tocPath), $entry->href);
            if (!isset($titles[$path]) && $entry->title !== '') {
                $titles[$path] = $entry->title;
            }
        }
        return $titles;
    }

    /**
     * Lines of the chapter's first h1–h3 heading (a <br> starts a new line).
     *
     * @return list<string>
     */
    private function headingLines(string $html): array
    {
        // Only the heading element is parsed, not the whole (often large) chapter.
        if (!preg_match('/<(h[1-3])[\s>].*?<\/\1\s*>/is', $html, $m)) {
            return [];
        }
        $dom = new \DOMDocument();
        if (!@$dom->loadHTML('<?xml encoding="UTF-8"><div>' . $m[0] . '</div>')) {
            return [];
        }
        $heading = (new \DOMXPath($dom))->query('(//h1|//h2|//h3)[1]');
        if ($heading === false || $heading->length === 0) {
            return [];
        }
        return TocLabel::linesOf($heading->item(0));
    }

    private function firstImageSrc(string $html): ?string
    {
        $dom = $html !== '' ? $this->dom($html) : null;
        if ($dom === null) {
            return null;
        }
        $node = (new \DOMXPath($dom))->query('(//*[local-name()="img" or local-name()="image"])[1]');
        if ($node === false || $node->length === 0) {
            return null;
        }
        /** @var \DOMElement $el */
        $el  = $node->item(0);
        $src = $el->getAttribute('src')
            ?: $el->getAttributeNS('http://www.w3.org/1999/xlink', 'href')
            ?: $el->getAttribute('xlink:href')
            ?: $el->getAttribute('href');
        return $src !== '' ? $src : null;
    }

    private function dom(string $html): ?\DOMDocument
    {
        $dom = new \DOMDocument();
        if (@$dom->loadXML($html)) {
            return $dom;
        }
        $dom = new \DOMDocument();
        return @$dom->loadHTML('<?xml encoding="UTF-8">' . $html) ? $dom : null;
    }

    private function opfDir(): string
    {
        $dir = dirname((string) $this->opfPath);
        return $dir === '.' ? '' : $dir;
    }

    /** Resolve an href (URL-encoded, maybe with "../") against an archive directory. */
    private function resolve(string $baseDir, string $href): string
    {
        $href = rawurldecode($href);
        if (str_contains($href, '#')) {
            $href = substr($href, 0, strpos($href, '#'));
        }
        $base = ($baseDir === '.' || $baseDir === '') ? '' : $baseDir . '/';
        return $this->normalize(str_starts_with($href, '/') ? $href : $base . $href);
    }

    /** Collapse "." and "dir/../" segments so paths match archive entry names. */
    private function normalize(string $path): string
    {
        $parts = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                array_pop($parts);
                continue;
            }
            $parts[] = $segment;
        }
        return implode('/', $parts);
    }
}

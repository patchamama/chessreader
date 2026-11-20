<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

use App\Application\Suggestions\SuggestionAssetStore;

/**
 * Works out how accepted suggestions change an EPUB, without writing it: the
 * new bytes of every entry that changes (chapters, the OPF, new images).
 *
 *   text         the anchored block's text (or sanitised HTML) is replaced
 *   insert       sanitised XHTML goes after the anchored block
 *   image        the matched <img> points at the new image (added to the EPUB)
 *   diagram-fen  the matched <img> gets data-fen
 *   cover        the declared cover's bytes are replaced (same type), or the
 *                image is added / picked and declared as the cover
 *
 * Anchors are those of the web client (suggestionApply.ts chapterBlocks): the
 * chapter's outermost p, h1-h6, li, pre, blockquote, table and figure, in
 * document order; a block matches while its text (whitespace collapsed, first
 * 40 characters) still starts with the quote, else the only block that does.
 * A suggestion whose anchor, image or value no longer fits is stale. Anchors
 * are all resolved on the original chapter before any change is made.
 */
final class EpubSuggestionEditor
{
    public const KINDS = ['text', 'insert', 'image', 'diagram-fen', 'cover'];
    private const BLOCKS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'pre', 'blockquote', 'table', 'figure'];
    private const FEN = '/^([1-8pnbrqkPNBRQK]{1,8}\/){7}[1-8pnbrqkPNBRQK]{1,8}(\s[wb](\s\S+){0,4})?$/';
    private const IMAGE_TYPES = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif', 'svg' => 'image/svg+xml'];
    private const IMAGE_EXT = '/\.(png|jpe?g|webp|gif|svg)$/i';
    private const ASSET = '~(?:^|/)suggestions/assets/([a-f0-9]{64}\.(png|jpg|webp))(?:[?#].*)?$~';
    private const BOOK_IMAGE_ROUTE = '~/api/library/books/\d+/images/(.+)$~';
    private const SPACE = '/[\s\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+/u';

    private \ZipArchive $zip;
    private EpubPackage $package;
    private ?string $opfPath = null;
    /** @var list<string> chapter archive paths, chapter N at N-1 */
    private array $chapters = [];
    /** @var array<string, \DOMDocument|false> */
    private array $docs = [];
    /** @var array<string, list<\DOMElement>> */
    private array $blocks = [];
    /** @var array<string, true> */
    private array $changedDocs = [];
    private \DOMDocument|false|null $opf = null;
    private bool $opfChanged = false;
    /** @var array<string, string> */
    private array $newEntries = [];
    /** @var array<int, \DOMNode> */
    private array $lastInserted = [];

    public function __construct(private readonly SuggestionAssetStore $assets)
    {
    }

    /**
     * @param list<array<string, mixed>> $suggestions accepted suggestions of the book (other kinds are ignored)
     * @return array{changes: array<string, string>, applied: list<string>, stale: list<string>}
     */
    public function plan(\ZipArchive $zip, array $suggestions): array
    {
        $this->reset($zip);
        $wanted = array_values(array_filter($suggestions, static fn (array $s): bool => in_array($s['kind'] ?? null, self::KINDS, true)));
        usort($wanted, static fn (array $a, array $b): int => [(string) $a['createdAt'], (string) $a['id']] <=> [(string) $b['createdAt'], (string) $b['id']]);

        $applied = [];
        $stale = [];
        $changes = [];
        foreach ($wanted as $s) {
            $change = $this->planOne($s);
            if ($change === null) {
                $stale[] = (string) $s['id'];
            } else {
                $changes[] = $change;
                $applied[] = (string) $s['id'];
            }
        }
        foreach ($changes as $change) {
            $change();
        }

        $out = $this->newEntries;
        foreach (array_keys($this->changedDocs) as $path) {
            $out[$path] = self::serializeXhtml($this->docs[$path]);
        }
        if ($this->opfChanged && $this->opf instanceof \DOMDocument && $this->opfPath !== null) {
            $out[$this->opfPath] = (string) $this->opf->saveXML();
        }
        return ['changes' => $out, 'applied' => $applied, 'stale' => $stale];
    }

    private function reset(\ZipArchive $zip): void
    {
        $this->zip = $zip;
        $this->package = EpubPackage::fromZip($zip);
        if ($this->package->opfPath() === null) {
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = (string) $zip->getNameIndex($i);
                if (str_ends_with(strtolower($name), '.opf')) {
                    $this->package = $this->package->withFallbackOpf($name);
                    break;
                }
            }
        }
        $this->opfPath = $this->package->opfPath();
        $this->chapters = array_column($this->package->chapters(), 'path');
        $this->docs = [];
        $this->blocks = [];
        $this->changedDocs = [];
        $this->opf = null;
        $this->opfChanged = false;
        $this->newEntries = [];
        $this->lastInserted = [];
    }

    /** @param array<string, mixed> $s */
    private function planOne(array $s): ?\Closure
    {
        $target = is_array($s['target'] ?? null) ? $s['target'] : [];
        $after = $s['after'] ?? null;
        $anchor = is_array($target['anchor'] ?? null) ? $target['anchor'] : null;
        $chapter = is_int($target['chapter'] ?? null) ? $target['chapter'] : (is_int($anchor['chapter'] ?? null) ? $anchor['chapter'] : null);

        return match ($s['kind']) {
            'text', 'insert' => $this->planBlock($s['kind'], $chapter, $anchor, $after),
            'image', 'diagram-fen' => $this->planImage($s['kind'], $chapter, is_string($target['image'] ?? null) ? $target['image'] : '', $after),
            'cover' => $this->planCover($after),
            default => null,
        };
    }

    /** @param array<string, mixed>|null $anchor */
    private function planBlock(string $kind, ?int $chapter, ?array $anchor, mixed $after): ?\Closure
    {
        $path = $chapter !== null ? ($this->chapters[$chapter - 1] ?? null) : null;
        $doc = $path !== null ? $this->doc($path) : null;
        if ($doc === null || $anchor === null) {
            return null;
        }
        $block = $this->findBlock($this->blocks[$path], $anchor);
        if ($block === null) {
            return null;
        }
        $ns = $block->namespaceURI;
        $images = $this->fragmentImages($path);

        if ($kind === 'text') {
            $html = is_array($after) && is_string($after['html'] ?? null) ? $after['html'] : null;
            $text = $html === null ? self::field($after, 'text') : null;
            if ($html === null && $text === null) {
                return null;
            }
            $nodes = $html !== null ? XhtmlFragment::import($html, $doc, $ns, $images) : [$doc->createTextNode((string) $text)];
            return function () use ($block, $nodes, $path): void {
                while ($block->firstChild !== null) {
                    $block->removeChild($block->firstChild);
                }
                foreach ($nodes as $node) {
                    $block->appendChild($node);
                }
                $this->changedDocs[$path] = true;
            };
        }

        $html = self::field($after, 'html');
        if ($html === null) {
            return null;
        }
        $nodes = XhtmlFragment::import($html, $doc, $ns, $images);
        return function () use ($block, $nodes, $path): void {
            if ($nodes === [] || $block->parentNode === null) {
                return;
            }
            $ref = $this->lastInserted[spl_object_id($block)] ?? $block;
            foreach ($nodes as $node) {
                $ref->parentNode->insertBefore($node, $ref->nextSibling);
                $ref = $node;
            }
            $this->lastInserted[spl_object_id($block)] = $ref;
            $this->changedDocs[$path] = true;
        };
    }

    private function planImage(string $kind, ?int $chapter, string $image, mixed $after): ?\Closure
    {
        if ($image === '') {
            return null;
        }
        $paths = $chapter !== null ? array_filter([$this->chapters[$chapter - 1] ?? null]) : $this->chapters;
        $matched = [];
        foreach ($paths as $path) {
            $doc = $this->doc($path);
            if ($doc === null) {
                continue;
            }
            foreach ($doc->getElementsByTagName('img') as $img) {
                if ($this->sameImage($img->getAttribute('src'), $path, $image)) {
                    $matched[] = [$img, $path];
                }
            }
        }
        if ($matched === []) {
            return null;
        }

        if ($kind === 'diagram-fen') {
            $fen = trim((string) self::field($after, 'fen'));
            if ($fen === '' || strlen($fen) > 100 || !preg_match(self::FEN, $fen)) {
                return null;
            }
            return function () use ($matched, $fen): void {
                foreach ($matched as [$img, $path]) {
                    $img->setAttribute('data-fen', $fen);
                    $this->changedDocs[$path] = true;
                }
            };
        }

        $entry = $this->imageEntry((string) self::field($after, 'src'));
        if ($entry === null) {
            return null;
        }
        return function () use ($matched, $entry): void {
            foreach ($matched as [$img, $path]) {
                $img->setAttribute('src', self::relative(self::dir($path), $entry));
                $this->changedDocs[$path] = true;
            }
        };
    }

    private function planCover(mixed $after): ?\Closure
    {
        $src = self::field($after, 'src') ?? self::field($after, 'epubPath');
        $source = $src !== null ? $this->imageSource($src) : null;
        $opf = $this->opf();
        if ($source === null || $opf === null || $this->opfPath === null) {
            return null;
        }
        $declared = $this->declaredCover();
        if (isset($source['bytes'])) {
            if ($declared !== null && self::ext($declared) === $source['ext']) {
                return function () use ($declared, $source): void {
                    $this->newEntries[$declared] = $source['bytes'];
                };
            }
            $path = $this->addImage($source['bytes'], $source['ext']);
        } else {
            $path = $source['path'];
            if ($path === $declared) {
                return static function (): void {
                };
            }
        }
        return function () use ($path): void {
            $this->declareCover($path);
        };
    }

    // ---- chapters -------------------------------------------------------

    private function doc(string $path): ?\DOMDocument
    {
        if (!array_key_exists($path, $this->docs)) {
            $xml = $this->zip->getFromName($path);
            $dom = new \DOMDocument();
            $dom->preserveWhiteSpace = true;
            // A chapter that is not well-formed XML is never rewritten (its suggestions are stale).
            $ok = $xml !== false && @$dom->loadXML($xml, LIBXML_NONET);
            $this->docs[$path] = $ok ? $dom : false;
            if ($ok) {
                $this->blocks[$path] = self::chapterBlocks($dom);
            }
        }
        return $this->docs[$path] ?: null;
    }

    /** @return list<\DOMElement> */
    private static function chapterBlocks(\DOMDocument $dom): array
    {
        $is = implode(' or ', array_map(static fn (string $n): string => "local-name()='{$n}'", self::BLOCKS));
        $nodes = (new \DOMXPath($dom))->query("//*[local-name()='body']//*[({$is}) and not(ancestor::*[{$is}])]");
        $out = [];
        foreach ($nodes ?: [] as $node) {
            if ($node instanceof \DOMElement) {
                $out[] = $node;
            }
        }
        return $out;
    }

    /**
     * @param list<\DOMElement> $blocks
     * @param array<string, mixed> $anchor
     */
    private function findBlock(array $blocks, array $anchor): ?\DOMElement
    {
        $quote = is_string($anchor['quote'] ?? null) ? $anchor['quote'] : null;
        $index = is_int($anchor['blockIndex'] ?? null) ? $anchor['blockIndex'] : -1;
        if ($quote === null) {
            return null;
        }
        $starts = static function (\DOMElement $el) use ($quote): bool {
            $text = self::quote($el->textContent);
            return $quote === '' ? $text === '' : str_starts_with($text, $quote);
        };
        $at = $blocks[$index] ?? null;
        if ($at !== null && $starts($at)) {
            return $at;
        }
        if ($quote === '') {
            return null;
        }
        $matches = array_values(array_filter($blocks, $starts));
        return count($matches) === 1 ? $matches[0] : null;
    }

    /** Whitespace collapsed, trimmed, cut to 40 characters (normalizeQuote of the web client). */
    public static function quote(string $text): string
    {
        $t = preg_replace(self::SPACE, ' ', $text) ?? $text;
        return mb_substr(trim($t, ' '), 0, 40);
    }

    /** Maps the <img> sources of inserted HTML: uploaded and data images are copied into the EPUB. */
    private function fragmentImages(string $chapterPath): \Closure
    {
        return function (string $src) use ($chapterPath): ?string {
            if (preg_match('~^https?:~i', $src)) {
                return $src;
            }
            $entry = $this->imageEntry($src);
            if ($entry !== null) {
                return self::relative(self::dir($chapterPath), $entry);
            }
            // An uploaded or data image that cannot be read is dropped; any other relative src stays.
            return preg_match(self::ASSET, $src) || str_starts_with(strtolower($src), 'data:') ? null : $src;
        };
    }

    private function sameImage(string $src, string $chapterPath, string $target): bool
    {
        if ($src === '') {
            return false;
        }
        if ($src === $target) {
            return true;
        }
        $t = self::bare(self::targetPath($target));
        $raw = self::stripQuery(rawurldecode($src));
        if ($t === '' || $raw === '') {
            return false;
        }
        $resolved = self::resolve(self::dir($chapterPath), $raw);
        return self::bare($raw) === $t || $resolved === $t || str_ends_with($resolved, '/' . $t) || str_ends_with($t, '/' . $resolved);
    }

    // ---- images and the OPF --------------------------------------------

    /** The archive path of the image a src names, copying an uploaded or data image into the EPUB; null when it cannot be used. */
    private function imageEntry(string $src): ?string
    {
        $source = $this->imageSource($src);
        if ($source === null) {
            return null;
        }
        return $source['path'] ?? $this->addImage($source['bytes'], $source['ext']);
    }

    /** @return array{bytes: string, ext: string}|array{path: string}|null */
    private function imageSource(string $src): ?array
    {
        $s = trim($src);
        if ($s === '') {
            return null;
        }
        if (preg_match(self::ASSET, $s, $m)) {
            $asset = $this->assets->read($m[1]);
            return $asset === null ? null : ['bytes' => $asset['bytes'], 'ext' => $m[2]];
        }
        if (preg_match('~^data:image/(png|jpeg|webp);base64,(.*)$~is', $s, $m)) {
            $bytes = base64_decode((string) preg_replace('/\s+/', '', $m[2]), true);
            if ($bytes === false || strlen($bytes) > SuggestionAssetStore::MAX_BYTES) {
                return null;
            }
            $ext = self::sniff($bytes);
            return $ext === null ? null : ['bytes' => $bytes, 'ext' => $ext];
        }
        if (preg_match('~^[a-z][a-z0-9+.-]*:~i', $s)) {
            return null; // external images are not fetched
        }
        $path = $this->findImageEntry(self::targetPath($s));
        return $path === null ? null : ['path' => $path];
    }

    private function findImageEntry(string $path): ?string
    {
        $p = ltrim(self::bare($path), '/');
        if ($p === '' || !preg_match(self::IMAGE_EXT, $p) || in_array('..', explode('/', $p), true)) {
            return null;
        }
        if ($this->zip->locateName($p) !== false) {
            return $p;
        }
        $found = [];
        for ($i = 0; $i < $this->zip->numFiles; $i++) {
            $name = (string) $this->zip->getNameIndex($i);
            if (str_ends_with($name, '/' . $p)) {
                $found[] = $name;
            }
        }
        return count($found) === 1 ? $found[0] : null;
    }

    /** Adds an image to the EPUB (once per content) with its manifest item; returns its archive path. */
    private function addImage(string $bytes, string $ext): string
    {
        $hash = substr(hash('sha256', $bytes), 0, 16);
        $path = $this->imagesDir() . "suggested-{$hash}.{$ext}";
        EpubWriter::assertSafeEntry($path);
        if ($this->zip->locateName($path) === false) {
            $this->newEntries[$path] = $bytes;
        }
        if ($this->itemFor($path) === null) {
            $this->addItem($path);
        }
        return $path;
    }

    /** The folder new images go to (with its trailing slash): that of the book's first image, else <opf dir>/images. */
    private function imagesDir(): string
    {
        $opf = $this->opf();
        $opfDir = $this->opfPath !== null ? self::dir($this->opfPath) : '';
        foreach ($opf !== null ? $this->items() : [] as $item) {
            if (str_starts_with($item->getAttribute('media-type'), 'image/')) {
                $dir = self::dir(self::resolve($opfDir, $item->getAttribute('href')));
                return $dir === '' ? '' : $dir . '/';
            }
        }
        return ($opfDir === '' ? '' : $opfDir . '/') . 'images/';
    }

    private function opf(): ?\DOMDocument
    {
        if ($this->opf === null) {
            $xml = $this->opfPath !== null ? $this->zip->getFromName($this->opfPath) : false;
            $dom = new \DOMDocument();
            $dom->preserveWhiteSpace = true;
            $this->opf = $xml !== false && @$dom->loadXML($xml, LIBXML_NONET) ? $dom : false;
        }
        return $this->opf ?: null;
    }

    /** @return list<\DOMElement> */
    private function items(): array
    {
        $opf = $this->opf();
        $nodes = $opf !== null ? (new \DOMXPath($opf))->query("//*[local-name()='manifest']/*[local-name()='item']") : false;
        $out = [];
        foreach ($nodes ?: [] as $n) {
            if ($n instanceof \DOMElement) {
                $out[] = $n;
            }
        }
        return $out;
    }

    private function itemFor(string $path): ?\DOMElement
    {
        $opfDir = self::dir((string) $this->opfPath);
        foreach ($this->items() as $item) {
            if (self::resolve($opfDir, $item->getAttribute('href')) === $path) {
                return $item;
            }
        }
        return null;
    }

    private function addItem(string $path): \DOMElement
    {
        $opf = $this->opf();
        $manifest = $opf !== null ? (new \DOMXPath($opf))->query("//*[local-name()='manifest']")->item(0) : null;
        if (!$manifest instanceof \DOMElement) {
            throw new \RuntimeException('the EPUB has no manifest');
        }
        $ids = array_map(static fn (\DOMElement $i): string => $i->getAttribute('id'), $this->items());
        $base = 'suggested-' . preg_replace('/[^A-Za-z0-9_-]/', '-', pathinfo($path, PATHINFO_FILENAME));
        $id = preg_match('/^[A-Za-z_]/', $base) ? $base : "x{$base}";
        for ($n = 2; in_array($id, $ids, true); $n++) {
            $id = "{$base}-{$n}";
        }
        $item = $opf->createElementNS($manifest->namespaceURI, 'item');
        $item->setAttribute('id', $id);
        $item->setAttribute('href', self::relative(self::dir((string) $this->opfPath), $path));
        $item->setAttribute('media-type', self::IMAGE_TYPES[self::ext($path)] ?? 'application/octet-stream');
        $manifest->appendChild($item);
        $this->opfChanged = true;
        return $item;
    }

    /** The cover the OPF declares (cover-image, <meta name="cover">, the guide's cover page), never the first-image fallback. */
    private function declaredCover(): ?string
    {
        $xml = $this->opfPath !== null ? $this->zip->getFromName($this->opfPath) : false;
        if ($xml === false) {
            return null;
        }
        try {
            $parsed = (new OpfManifestParser())->parseXml($xml);
        } catch (\RuntimeException) {
            return null;
        }
        if ($parsed['coverImage'] === null && $parsed['coverPage'] === null) {
            return null;
        }
        $path = $this->package->coverPath();
        return $path !== null && $this->zip->locateName($path) !== false ? $path : null;
    }

    /** Makes the image at $path the book's cover: its manifest item, cover-image (EPUB 3), <meta name="cover"> and the cover page. */
    private function declareCover(string $path): void
    {
        $opf = $this->opf();
        if ($opf === null) {
            return;
        }
        $item = $this->itemFor($path) ?? $this->addItem($path);
        foreach ($this->items() as $other) {
            $props = array_values(array_filter(preg_split('/\s+/', trim($other->getAttribute('properties'))) ?: [], static fn (string $p): bool => $p !== '' && $p !== 'cover-image'));
            if ($other === $item && version_compare((string) $opf->documentElement?->getAttribute('version'), '3.0', '>=')) {
                $props[] = 'cover-image';
            }
            if ($props === []) {
                $other->removeAttribute('properties');
            } else {
                $other->setAttribute('properties', implode(' ', $props));
            }
        }
        $xp = new \DOMXPath($opf);
        $meta = $xp->query("//*[local-name()='metadata']/*[local-name()='meta'][@name='cover']")->item(0);
        if ($meta instanceof \DOMElement) {
            $meta->setAttribute('content', $item->getAttribute('id'));
        } else {
            $metadata = $xp->query("//*[local-name()='metadata']")->item(0);
            if ($metadata instanceof \DOMElement) {
                $meta = $opf->createElementNS($metadata->namespaceURI, 'meta');
                $meta->setAttribute('name', 'cover');
                $meta->setAttribute('content', $item->getAttribute('id'));
                $metadata->appendChild($meta);
            }
        }
        $this->opfChanged = true;
        $this->pointCoverPage($path);
    }

    /** The guide's cover page shows the new cover too. */
    private function pointCoverPage(string $path): void
    {
        $xml = $this->opfPath !== null ? $this->zip->getFromName($this->opfPath) : false;
        $coverPage = null;
        try {
            $coverPage = $xml !== false ? (new OpfManifestParser())->parseXml($xml)['coverPage'] : null;
        } catch (\RuntimeException) {
        }
        if ($coverPage === null) {
            return;
        }
        $page = self::resolve(self::dir((string) $this->opfPath), $coverPage);
        $doc = $this->doc($page);
        if ($doc === null) {
            return;
        }
        $node = (new \DOMXPath($doc))->query('(//*[local-name()="img" or local-name()="image"])[1]')->item(0);
        if (!$node instanceof \DOMElement) {
            return;
        }
        $href = self::relative(self::dir($page), $path);
        if ($node->localName === 'img') {
            $node->setAttribute('src', $href);
        } else {
            $node->setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', $href);
            if ($node->hasAttribute('href')) {
                $node->setAttribute('href', $href);
            }
        }
        $this->changedDocs[$page] = true;
    }

    // ---- helpers ----------------------------------------------------------

    private static function field(mixed $after, string $key): ?string
    {
        if (is_string($after)) {
            return $after;
        }
        return is_array($after) && is_string($after[$key] ?? null) ? $after[$key] : null;
    }

    private static function sniff(string $bytes): ?string
    {
        return match (true) {
            str_starts_with($bytes, "\x89PNG\r\n\x1a\n") => 'png',
            str_starts_with($bytes, "\xFF\xD8\xFF") => 'jpg',
            strlen($bytes) >= 12 && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP' => 'webp',
            default => null,
        };
    }

    private static function ext(string $path): string
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        return $ext === 'jpeg' ? 'jpg' : $ext;
    }

    /** A target image as an archive-ish path: the reader's image URL unwrapped, decoded, without query or fragment. */
    private static function targetPath(string $target): string
    {
        $t = self::stripQuery(trim($target));
        if (preg_match(self::BOOK_IMAGE_ROUTE, $t, $m)) {
            $t = $m[1];
        }
        return rawurldecode($t);
    }

    private static function stripQuery(string $s): string
    {
        return (string) preg_replace('/[?#].*$/s', '', $s);
    }

    /** Without leading "./", "../" and "/". */
    private static function bare(string $path): string
    {
        return (string) preg_replace('~^(?:\.{1,2}/|/)+~', '', $path);
    }

    private static function dir(string $path): string
    {
        $dir = dirname($path);
        return $dir === '.' ? '' : $dir;
    }

    private static function resolve(string $baseDir, string $href): string
    {
        $href = self::stripQuery(rawurldecode($href));
        $full = str_starts_with($href, '/') ? $href : ($baseDir === '' ? $href : $baseDir . '/' . $href);
        $parts = [];
        foreach (explode('/', $full) as $seg) {
            if ($seg === '' || $seg === '.') {
                continue;
            }
            if ($seg === '..') {
                array_pop($parts);
                continue;
            }
            $parts[] = $seg;
        }
        return implode('/', $parts);
    }

    /** The href from a document in $fromDir to the archive path $to. */
    private static function relative(string $fromDir, string $to): string
    {
        $from = $fromDir === '' ? [] : explode('/', $fromDir);
        $parts = explode('/', $to);
        while ($from !== [] && count($parts) > 1 && $from[0] === $parts[0]) {
            array_shift($from);
            array_shift($parts);
        }
        return str_repeat('../', count($from)) . implode('/', array_map('rawurlencode', $parts));
    }

    /** XHTML that an HTML parser reads the same way: void elements self-closed, every other element with its end tag. */
    private static function serializeXhtml(\DOMDocument $doc): string
    {
        $xml = (string) $doc->saveXML(null, LIBXML_NOEMPTYTAG);
        return (string) preg_replace(
            '~<((?:[A-Za-z][\w.-]*:)?(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr))(\s[^<>]*)?></\1>~',
            '<$1$2/>',
            $xml,
        );
    }
}

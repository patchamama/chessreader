<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/**
 * Builds an EPUB 3 (with an EPUB 2 NCX for older readers) from the structured
 * book the web app assembles from a Lichess study: chapters of blocks (heading,
 * paragraph, diagram image, note under a diagram), the images and a cover.
 *
 * The client never sends markup: every text is escaped here, so the XHTML is
 * always well formed and cannot carry scripts. Images are checked (known type,
 * size, no active content in an SVG) and referenced only by name.
 *
 * Payload:
 *   title, author, language ("en"…), 
 *   chapters: [{title, blocks: [{type:"p"|"h2"|"note", text} | {type:"img", image, alt}]}]
 *   images:   [{name, mime, data: base64}]
 *   cover:    {mime, data: base64} | null
 */
final class StudyEpubBuilder
{
    public const MAX_IMAGE_BYTES = 2_000_000;
    public const MAX_IMAGES = 1500;
    public const MAX_CHAPTERS = 500;

    private const MIME_EXT = [
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
        'image/svg+xml' => 'svg',
    ];

    /**
     * Writes the EPUB to $targetPath.
     *
     * @param array<string,mixed> $book
     * @throws \InvalidArgumentException when the payload is not a valid book (nothing is written)
     */
    public function build(array $book, string $targetPath): void
    {
        $title = $this->text($book['title'] ?? null, 'title', 300);
        $author = trim((string) ($book['author'] ?? ''));
        $author = $author === '' ? 'Unknown' : $this->text($author, 'author', 300);
        $language = strtolower(trim((string) ($book['language'] ?? 'en')));
        if (!preg_match('/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/', $language)) {
            throw new \InvalidArgumentException('language is not a language code');
        }

        $images = $this->images($book['images'] ?? []);
        $cover = $this->cover($book['cover'] ?? null);

        $chaptersIn = $book['chapters'] ?? null;
        if (!is_array($chaptersIn) || $chaptersIn === [] || !array_is_list($chaptersIn)) {
            throw new \InvalidArgumentException('chapters must be a non-empty list');
        }
        if (count($chaptersIn) > self::MAX_CHAPTERS) {
            throw new \InvalidArgumentException('too many chapters');
        }

        $chapters = [];
        foreach ($chaptersIn as $i => $chapter) {
            if (!is_array($chapter)) {
                throw new \InvalidArgumentException("chapter {$i} is not an object");
            }
            $chapters[] = [
                'title' => $this->text($chapter['title'] ?? null, "chapter {$i} title", 500),
                'xhtml' => $this->chapterXhtml($chapter, $language, $images),
            ];
        }

        $this->write($targetPath, $title, $author, $language, $chapters, $images, $cover);
    }

    /** @return array<string,array{ext:string,mime:string,bytes:string}> */
    private function images(mixed $list): array
    {
        if (!is_array($list) || !array_is_list($list)) {
            throw new \InvalidArgumentException('images must be a list');
        }
        if (count($list) > self::MAX_IMAGES) {
            throw new \InvalidArgumentException('too many images');
        }
        $out = [];
        foreach ($list as $image) {
            $name = is_array($image) ? (string) ($image['name'] ?? '') : '';
            if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $name) || $name === 'cover') {
                throw new \InvalidArgumentException('an image has an invalid name');
            }
            if (isset($out[$name])) {
                throw new \InvalidArgumentException("image {$name} is repeated");
            }
            $out[$name] = $this->imageBytes($image, "image {$name}");
        }
        return $out;
    }

    /** @return ?array{ext:string,mime:string,bytes:string} */
    private function cover(mixed $cover): ?array
    {
        if ($cover === null) {
            return null;
        }
        if (!is_array($cover)) {
            throw new \InvalidArgumentException('cover must be an object');
        }
        return $this->imageBytes($cover, 'cover');
    }

    /**
     * @param array<string,mixed> $image
     * @return array{ext:string,mime:string,bytes:string}
     */
    private function imageBytes(array $image, string $what): array
    {
        $mime = (string) ($image['mime'] ?? '');
        $ext = self::MIME_EXT[$mime] ?? null;
        if ($ext === null) {
            throw new \InvalidArgumentException("{$what}: unsupported image type");
        }
        $bytes = base64_decode((string) ($image['data'] ?? ''), true);
        if ($bytes === false || $bytes === '') {
            throw new \InvalidArgumentException("{$what}: the data is not base64");
        }
        if (strlen($bytes) > self::MAX_IMAGE_BYTES) {
            throw new \InvalidArgumentException("{$what}: the image is too large");
        }
        if ($ext === 'svg' && preg_match('~<script|\son[a-z]+\s*=|javascript:|<foreignObject|<!ENTITY~i', $bytes)) {
            throw new \InvalidArgumentException("{$what}: the SVG has active content");
        }
        if ($ext === 'svg' && @simplexml_load_string($bytes) === false) {
            throw new \InvalidArgumentException("{$what}: the SVG is not valid XML");
        }
        return ['ext' => $ext, 'mime' => $mime, 'bytes' => $bytes];
    }

    private function text(mixed $value, string $what, int $max): string
    {
        $s = trim((string) (is_scalar($value) ? $value : ''));
        // Control characters are not allowed in XML 1.0.
        $s = (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s);
        if ($s === '') {
            throw new \InvalidArgumentException("{$what} is required");
        }
        return mb_substr($s, 0, $max);
    }

    private static function esc(string $s): string
    {
        return htmlspecialchars((string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s), ENT_QUOTES | ENT_XML1 | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * @param array<string,mixed> $chapter
     * @param array<string,array{ext:string,mime:string,bytes:string}> $images
     */
    private function chapterXhtml(array $chapter, string $language, array $images): string
    {
        $title = self::esc($this->text($chapter['title'] ?? null, 'chapter title', 500));
        $blocks = $chapter['blocks'] ?? [];
        if (!is_array($blocks) || !array_is_list($blocks)) {
            throw new \InvalidArgumentException('blocks must be a list');
        }
        $body = ["<h1>{$title}</h1>"];
        foreach ($blocks as $block) {
            $type = is_array($block) ? (string) ($block['type'] ?? '') : '';
            switch ($type) {
                case 'p':
                    $body[] = '<p>' . self::esc((string) ($block['text'] ?? '')) . '</p>';
                    break;
                case 'h2':
                    $body[] = '<h2>' . self::esc((string) ($block['text'] ?? '')) . '</h2>';
                    break;
                case 'note':
                    $body[] = '<p class="diagram-eval">' . nl2br(self::esc((string) ($block['text'] ?? '')), true) . '</p>';
                    break;
                case 'img':
                    $name = (string) ($block['image'] ?? '');
                    if (!isset($images[$name])) {
                        throw new \InvalidArgumentException("a chapter uses the unknown image {$name}");
                    }
                    $alt = self::esc((string) ($block['alt'] ?? 'Diagram'));
                    $fen = isset($block['fen']) ? ' data-fen="' . self::esc((string) $block['fen']) . '"' : '';
                    $body[] = "<p class=\"diagram\"><img class=\"diagram\" src=\"../Images/{$name}.{$images[$name]['ext']}\" alt=\"{$alt}\"{$fen}/></p>";
                    break;
                default:
                    throw new \InvalidArgumentException('a block has an unknown type');
            }
        }
        $lang = self::esc($language);
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            . "<!DOCTYPE html>\n"
            . "<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" lang=\"{$lang}\" xml:lang=\"{$lang}\">\n"
            . "<head><meta charset=\"utf-8\"/><title>{$title}</title></head>\n<body>\n" . implode("\n", $body) . "\n</body>\n</html>\n";
    }

    /**
     * @param list<array{title:string,xhtml:string}> $chapters
     * @param array<string,array{ext:string,mime:string,bytes:string}> $images
     * @param ?array{ext:string,mime:string,bytes:string} $cover
     */
    private function write(string $path, string $title, string $author, string $language, array $chapters, array $images, ?array $cover): void
    {
        $zip = new \ZipArchive();
        if ($zip->open($path, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('cannot create the EPUB archive');
        }
        $id = 'urn:uuid:' . bin2hex(random_bytes(16));
        $manifest = [
            '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
            '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
            '<item id="css" href="style.css" media-type="text/css"/>',
        ];
        $spine = [];
        $navItems = [];
        $ncxItems = [];

        $zip->addFromString('mimetype', 'application/epub+zip');
        $zip->setCompressionName('mimetype', \ZipArchive::CM_STORE);
        $zip->addFromString('META-INF/container.xml',
            '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>'
            . '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
        $zip->addFromString('OEBPS/style.css',
            "body { font-family: serif; line-height: 1.4; }\nimg.diagram { max-width: 100%; height: auto; }\n"
            . "p.diagram { text-align: center; margin: 1em 0 0.2em; }\np.diagram-eval { text-align: center; font-size: 0.85em; margin-top: 0; }\n");

        foreach ($chapters as $i => $chapter) {
            $n = $i + 1;
            $file = "Text/ch{$n}.xhtml";
            $zip->addFromString('OEBPS/' . $file, $chapter['xhtml']);
            $manifest[] = "<item id=\"ch{$n}\" href=\"{$file}\" media-type=\"application/xhtml+xml\"/>";
            $spine[] = "<itemref idref=\"ch{$n}\"/>";
            $label = self::esc($chapter['title']);
            $navItems[] = "<li><a href=\"{$file}\">{$label}</a></li>";
            $ncxItems[] = "<navPoint id=\"np{$n}\" playOrder=\"{$n}\"><navLabel><text>{$label}</text></navLabel><content src=\"{$file}\"/></navPoint>";
        }
        foreach ($images as $name => $image) {
            $zip->addFromString("OEBPS/Images/{$name}.{$image['ext']}", $image['bytes']);
            $manifest[] = "<item id=\"img-{$name}\" href=\"Images/{$name}.{$image['ext']}\" media-type=\"{$image['mime']}\"/>";
        }
        $coverMeta = '';
        if ($cover !== null) {
            $zip->addFromString("OEBPS/Images/cover.{$cover['ext']}", $cover['bytes']);
            $manifest[] = "<item id=\"cover-image\" href=\"Images/cover.{$cover['ext']}\" media-type=\"{$cover['mime']}\" properties=\"cover-image\"/>";
            $coverMeta = '<meta name="cover" content="cover-image"/>';
        }

        $t = self::esc($title);
        $a = self::esc($author);
        $l = self::esc($language);
        $zip->addFromString('OEBPS/content.opf',
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            . "<package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"bookid\">\n"
            . "<metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n"
            . "<dc:identifier id=\"bookid\">{$id}</dc:identifier><dc:title>{$t}</dc:title><dc:creator>{$a}</dc:creator><dc:language>{$l}</dc:language>"
            . '<meta property="dcterms:modified">' . gmdate('Y-m-d\TH:i:s\Z') . "</meta>{$coverMeta}\n</metadata>\n"
            . "<manifest>\n" . implode("\n", $manifest) . "\n</manifest>\n<spine toc=\"ncx\">\n" . implode("\n", $spine) . "\n</spine>\n</package>\n");
        $zip->addFromString('OEBPS/nav.xhtml',
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE html>\n"
            . "<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\"><head><meta charset=\"utf-8\"/><title>{$t}</title></head>\n"
            . "<body><nav epub:type=\"toc\"><h1>{$t}</h1><ol>" . implode('', $navItems) . "</ol></nav></body></html>\n");
        $zip->addFromString('OEBPS/toc.ncx',
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            . "<ncx xmlns=\"http://www.daisy.org/z3986/2005/ncx/\" version=\"2005-1\"><head><meta name=\"dtb:uid\" content=\"{$id}\"/></head>"
            . "<docTitle><text>{$t}</text></docTitle><navMap>" . implode('', $ncxItems) . "</navMap></ncx>\n");

        if (!$zip->close()) {
            throw new \RuntimeException('cannot finish the EPUB archive');
        }
    }
}

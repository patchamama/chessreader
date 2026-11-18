<?php

declare(strict_types=1);

namespace App\Tests\Fixtures\epub;

/**
 * Builds tiny EPUB archives from an inner-path => contents map, for tests that
 * need a specific OPF / NCX / nav / chapter shape.
 */
final class EpubBuilder
{
    /** @param array<string,string> $files inner path => contents (container.xml is added when missing) */
    public static function zip(array $files, string $opfPath = 'OEBPS/content.opf'): string
    {
        $path = sys_get_temp_dir() . '/epub_builder_' . uniqid() . '.epub';
        $zip  = new \ZipArchive();
        if ($zip->open($path, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException("Cannot create test epub at $path");
        }
        $zip->addFromString('mimetype', 'application/epub+zip');
        if (!isset($files['META-INF/container.xml'])) {
            $zip->addFromString('META-INF/container.xml', self::container($opfPath));
        }
        foreach ($files as $name => $contents) {
            $zip->addFromString($name, $contents);
        }
        $zip->close();
        return $path;
    }

    /** Extracts an archive built by zip() into a fresh temp directory. */
    public static function extract(string $epubPath): string
    {
        $dir = sys_get_temp_dir() . '/epub_builder_dir_' . uniqid();
        mkdir($dir, 0777, true);
        $zip = new \ZipArchive();
        $zip->open($epubPath);
        $zip->extractTo($dir);
        $zip->close();
        return $dir;
    }

    public static function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        foreach (scandir($dir) ?: [] as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = "$dir/$item";
            is_dir($path) ? self::rrmdir($path) : unlink($path);
        }
        rmdir($dir);
    }

    public static function container(string $opfPath = 'OEBPS/content.opf'): string
    {
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="$opfPath" media-type="application/oebps-package+xml"/></rootfiles>
</container>
XML;
    }

    /**
     * @param string $manifest <item> elements
     * @param string $spine    <itemref> elements
     */
    public static function opf(string $manifest, string $spine, string $meta = '', string $guide = '', string $spineAttrs = '', string $version = '2.0'): string
    {
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="$version" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title><dc:creator>Tester</dc:creator><dc:identifier id="id">t-1</dc:identifier>
    $meta
  </metadata>
  <manifest>$manifest</manifest>
  <spine $spineAttrs>$spine</spine>
  $guide
</package>
XML;
    }

    public static function xhtml(string $body, string $title = 'x'): string
    {
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>$title</title></head>
<body>$body</body>
</html>
XML;
    }

    /** @param list<array{0:string,1:string,2?:list<array{0:string,1:string}>}> $points [label, src, children] */
    public static function ncx(array $points): string
    {
        $order = 0;
        $render = function (array $pts) use (&$render, &$order): string {
            $out = '';
            foreach ($pts as $p) {
                $order++;
                $children = isset($p[2]) ? $render($p[2]) : '';
                $out .= "<navPoint id=\"np$order\" playOrder=\"$order\"><navLabel><text>{$p[0]}</text></navLabel><content src=\"{$p[1]}\"/>$children</navPoint>";
            }
            return $out;
        };
        $map = $render($points);
        return <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="t-1"/></head>
  <docTitle><text>Test Book</text></docTitle>
  <navMap>$map</navMap>
</ncx>
XML;
    }
}

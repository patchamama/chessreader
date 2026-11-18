<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/**
 * Parses an EPUB 3 navigation document (nav.xhtml): the <nav epub:type="toc">
 * links, nested ones included, in document order. A <br> inside a link label
 * becomes a line of the title.
 */
final class NavTocParser
{
    private const OPS_NS = 'http://www.idpf.org/2007/ops';

    /** @return TocEntry[] hrefs as written (relative to the nav document), fragment stripped */
    public function parseXml(string $xml): array
    {
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($xml)) {
            // Tolerate a nav document that is HTML rather than well-formed XHTML.
            $dom = new \DOMDocument();
            if (!@$dom->loadHTML('<?xml encoding="UTF-8">' . $xml)) {
                throw new \RuntimeException('Cannot parse nav document');
            }
        }
        $xpath = new \DOMXPath($dom);

        $navs = $xpath->query('//*[local-name()="nav"]');
        $toc  = null;
        foreach ($navs ?: [] as $nav) {
            /** @var \DOMElement $nav */
            $type = $nav->getAttributeNS(self::OPS_NS, 'type') ?: $nav->getAttribute('epub:type');
            if (in_array('toc', preg_split('/\s+/', $type) ?: [], true)) {
                $toc = $nav;
                break;
            }
        }
        if ($toc === null) {
            $toc = ($navs !== false && $navs->length > 0) ? $navs->item(0) : null;
        }
        if ($toc === null) {
            return [];
        }

        $entries = [];
        foreach ($xpath->query('.//*[local-name()="a"][@href]', $toc) ?: [] as $a) {
            /** @var \DOMElement $a */
            $href = $a->getAttribute('href');
            if (str_contains($href, '#')) {
                $href = substr($href, 0, strpos($href, '#'));
            }
            $entries[] = new TocEntry(
                order: count($entries) + 1,
                title: TocLabel::fromLines(TocLabel::linesOf($a)),
                href: $href,
            );
        }
        return $entries;
    }
}

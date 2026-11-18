<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/**
 * Parses an EPUB 2 toc.ncx file and returns ordered TocEntry list.
 *
 * Walks every navPoint (nested ones included) in document order, so a spine
 * document only listed under a parent entry still gets its own label.
 * Isolated, stateless, unit-testable with no I/O side effects beyond reading one file.
 */
final class NcxTocParser
{
    private const NS = 'http://www.daisy.org/z3986/2005/ncx/';

    /** @return TocEntry[] ordered by playOrder */
    public function parse(string $ncxPath): array
    {
        if (!is_file($ncxPath)) {
            throw new \RuntimeException("NCX file not found: $ncxPath");
        }

        $xml = file_get_contents($ncxPath);
        if ($xml === false) {
            throw new \RuntimeException("Cannot read NCX file: $ncxPath");
        }

        return $this->parseXml($xml);
    }

    /** @return TocEntry[] ordered by playOrder (document order for ties) */
    public function parseXml(string $xml): array
    {
        $dom = new \DOMDocument();
        // Suppress warnings from DTD declaration in the NCX
        if (!@$dom->loadXML($xml)) {
            throw new \RuntimeException('Cannot parse NCX XML');
        }

        $xpath = new \DOMXPath($dom);
        $xpath->registerNamespace('ncx', self::NS);

        $navPoints = $xpath->query('//ncx:navMap//ncx:navPoint');
        if ($navPoints === false || $navPoints->length === 0) {
            // Fallback: try without namespace (some NCX files omit it)
            $navPoints = $xpath->query('//*[local-name()="navMap"]//*[local-name()="navPoint"]');
        }

        $entries = [];
        foreach ($navPoints ?: [] as $node) {
            /** @var \DOMElement $node */
            $playOrder = (int) ($node->getAttribute('playOrder') ?: count($entries) + 1);

            // Own navLabel/text and content only — not those of nested navPoints.
            $title = '';
            $label = $this->firstChild($node, 'navLabel');
            if ($label !== null) {
                $text = $this->firstChild($label, 'text');
                $title = TocLabel::fromText(($text ?? $label)->textContent);
            }

            $href    = '';
            $content = $this->firstChild($node, 'content');
            if ($content !== null) {
                $href = $content->getAttribute('src');
                // Strip fragment anchors if any
                if (str_contains($href, '#')) {
                    $href = substr($href, 0, strpos($href, '#'));
                }
            }

            $entries[] = new TocEntry(order: $playOrder, title: $title, href: $href);
        }

        // Sort by playOrder to guarantee order (usort is stable: document order for ties)
        usort($entries, fn(TocEntry $a, TocEntry $b) => $a->order <=> $b->order);

        return $entries;
    }

    private function firstChild(\DOMElement $parent, string $localName): ?\DOMElement
    {
        foreach ($parent->childNodes as $child) {
            if ($child instanceof \DOMElement && $child->localName === $localName) {
                return $child;
            }
        }
        return null;
    }
}

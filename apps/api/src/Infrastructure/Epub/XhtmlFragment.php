<?php

declare(strict_types=1);

namespace App\Infrastructure\Epub;

/**
 * HTML from a suggestion turned into safe nodes of an XHTML chapter: the same
 * rules as the web client's sanitizeHtml (no scripts, frames, forms, event
 * handlers, srcdoc, script URLs or style URLs), stricter on SVG and MathML
 * (dropped). New elements are created in the chapter's namespace, so they
 * serialise as XHTML (never xmlns="").
 */
final class XhtmlFragment
{
    private const REMOVED = [
        'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'base', 'link', 'meta', 'style',
        'form', 'input', 'button', 'textarea', 'select', 'noscript', 'noembed', 'noframes', 'xmp', 'template',
        'svg', 'math', 'foreignobject', 'animate', 'set', 'animatetransform', 'animatemotion', 'html', 'head', 'title',
    ];
    private const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'poster', 'background', 'srcset', 'data', 'cite', 'longdesc'];

    /**
     * @param ?\Closure(string):?string $imageSource maps an <img> src to the src to write (null drops the image)
     * @return list<\DOMNode> nodes owned by $target, not yet inserted
     */
    public static function import(string $html, \DOMDocument $target, ?string $namespace, ?\Closure $imageSource = null): array
    {
        $source = new \DOMDocument();
        $wrapped = '<?xml encoding="UTF-8"><html><body><div id="xhtml-fragment-root">' . $html . '</div></body></html>';
        if (!@$source->loadHTML($wrapped, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING)) {
            return [];
        }
        $root = $source->getElementById('xhtml-fragment-root')
            ?? (new \DOMXPath($source))->query('//div[@id="xhtml-fragment-root"]')->item(0);
        if (!$root instanceof \DOMElement) {
            return [];
        }
        $out = [];
        foreach (iterator_to_array($root->childNodes) as $child) {
            $node = self::copy($child, $target, $namespace, $imageSource);
            if ($node !== null) {
                $out[] = $node;
            }
        }
        return $out;
    }

    /** Whether a URL is safe in a chapter: relative, http(s), or (for images) a PNG, JPEG or WebP data URL. */
    public static function safeUrl(string $url, bool $image = false): bool
    {
        $u = trim($url);
        if (preg_match('/[\x00-\x1f\x7f]/', $u)) {
            return false;
        }
        if (!preg_match('/^([a-z][a-z0-9+.-]*):/i', $u, $m)) {
            return true;
        }
        $scheme = strtolower($m[1]);
        if ($scheme === 'http' || $scheme === 'https') {
            return true;
        }
        return $image && $scheme === 'data' && preg_match('~^data:image/(png|jpeg|webp);base64,~i', $u) === 1;
    }

    private static function copy(\DOMNode $node, \DOMDocument $target, ?string $ns, ?\Closure $imageSource): ?\DOMNode
    {
        if ($node instanceof \DOMText && !$node instanceof \DOMCdataSection) {
            return $target->createTextNode($node->data);
        }
        if ($node instanceof \DOMCdataSection) {
            return $target->createTextNode($node->data);
        }
        if (!$node instanceof \DOMElement) {
            return null; // comments, processing instructions
        }
        $name = strtolower($node->localName ?? $node->nodeName);
        if (in_array($name, self::REMOVED, true) || !preg_match('/^[a-z][a-z0-9-]*$/', $name)) {
            return null;
        }
        $el = $ns !== null ? $target->createElementNS($ns, $name) : $target->createElement($name);
        foreach (iterator_to_array($node->attributes ?? []) as $attr) {
            /** @var \DOMAttr $attr */
            $attrName = strtolower($attr->name);
            $value = $attr->value;
            if (!preg_match('/^[a-z][a-z0-9_.-]*$/', $attrName) || str_starts_with($attrName, 'on') || $attrName === 'srcdoc'
                || $attrName === 'xmlns' || ($attrName === 'style' && preg_match('/expression|javascript:|url\s*\(/i', $value))) {
                continue;
            }
            if (in_array($attrName, self::URL_ATTRS, true)) {
                $isImageSrc = $name === 'img' && $attrName === 'src';
                if (!self::safeUrl($value, $isImageSrc)) {
                    continue;
                }
                if ($isImageSrc && $imageSource !== null) {
                    $mapped = $imageSource(trim($value));
                    if ($mapped === null) {
                        return null;
                    }
                    $value = $mapped;
                }
            }
            $el->setAttribute($attrName, $value);
        }
        foreach (iterator_to_array($node->childNodes) as $child) {
            $copy = self::copy($child, $target, $ns, $imageSource);
            if ($copy !== null) {
                $el->appendChild($copy);
            }
        }
        return $el;
    }
}

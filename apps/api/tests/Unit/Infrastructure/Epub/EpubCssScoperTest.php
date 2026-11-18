<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Infrastructure\Epub\EpubCssScoper;
use PHPUnit\Framework\TestCase;

final class EpubCssScoperTest extends TestCase
{
    private const S = ':where(.epub-content)';

    public function test_every_selector_is_scoped_to_the_reader_content(): void
    {
        $css = (new EpubCssScoper())->scope('.h3 {font-weight:bold; font-size:130%} h1, h2 {text-align:center}');

        self::assertStringContainsString(self::S . ' .h3 {font-weight:bold; font-size:130%}', $css);
        self::assertStringContainsString(self::S . ' h1, ' . self::S . ' h2 {text-align:center}', $css);
    }

    public function test_body_and_html_rules_become_the_content_root(): void
    {
        $css = (new EpubCssScoper())->scope('body {text-align:justify} html body p.x {margin:0}');

        self::assertStringContainsString(self::S . ' {text-align:justify}', $css);
        self::assertStringContainsString(self::S . ' p.x {margin:0}', $css);
        self::assertStringNotContainsString('body', $css);
    }

    public function test_media_blocks_are_scoped_inside(): void
    {
        $css = (new EpubCssScoper())->scope('@media screen { .fen {display:none} }');

        self::assertStringContainsString('@media screen {', $css);
        self::assertStringContainsString(self::S . ' .fen {display:none}', $css);
    }

    public function test_imports_fonts_comments_and_urls_are_dropped(): void
    {
        $css = (new EpubCssScoper())->scope(
            "@charset \"utf-8\";\n@import url(other.css);\n/* note */"
            . "@font-face { font-family: X; src: url(../Fonts/x.ttf) }\n"
            . ".a { background: url(../Images/bg.png); color: red }",
        );

        self::assertStringNotContainsString('@import', $css);
        self::assertStringNotContainsString('@font-face', $css);
        self::assertStringNotContainsString('@charset', $css);
        self::assertStringNotContainsString('note', $css);
        self::assertStringNotContainsString('url(', $css);
        self::assertStringContainsString(self::S . ' .a {color: red}', $css);
    }

    public function test_a_closing_style_tag_cannot_escape_the_style_element(): void
    {
        $css = (new EpubCssScoper())->scope('.a { content: "</style><script>x</script>" }');

        self::assertStringNotContainsString('</style', $css);
    }
}

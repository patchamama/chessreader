<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Infrastructure\Epub\EpubPackage;
use App\Infrastructure\Epub\EpubSuggestionEditor;
use App\Infrastructure\Suggestions\FilesystemSuggestionAssetStore;
use App\Tests\Unit\Infrastructure\Epub\SuggestionEpubFixture as F;
use PHPUnit\Framework\TestCase;

final class EpubSuggestionEditorTest extends TestCase
{
    private const C1 = 'OEBPS/Text/c1.xhtml';

    /** @var list<string> */
    private array $cleanup = [];
    private string $assetsDir;
    private FilesystemSuggestionAssetStore $assets;

    protected function setUp(): void
    {
        $this->assetsDir = sys_get_temp_dir() . '/editor-assets-' . bin2hex(random_bytes(4));
        $this->assets = new FilesystemSuggestionAssetStore($this->assetsDir);
    }

    protected function tearDown(): void
    {
        foreach ($this->cleanup as $p) {
            @unlink($p);
        }
        exec('rm -rf ' . escapeshellarg($this->assetsDir));
    }

    /**
     * @param list<array<string,mixed>> $suggestions
     * @return array{changes: array<string,string>, applied: list<string>, stale: list<string>}
     */
    private function plan(array $suggestions, array $override = []): array
    {
        $path = F::zip($override);
        $this->cleanup[] = $path;
        $zip = new \ZipArchive();
        $zip->open($path);
        $plan = (new EpubSuggestionEditor($this->assets))->plan($zip, $suggestions);
        $zip->close();
        return $plan;
    }

    private function dom(string $xhtml): \DOMXPath
    {
        $dom = new \DOMDocument();
        self::assertTrue($dom->loadXML($xhtml), 'the written chapter is well-formed XML');
        $xp = new \DOMXPath($dom);
        $xp->registerNamespace('h', 'http://www.w3.org/1999/xhtml');
        return $xp;
    }

    private static function anchor(int $blockIndex, string $text, int $chapter = 1): array
    {
        $quote = mb_substr(trim((string) preg_replace('/\s+/u', ' ', $text)), 0, 40);
        return ['chapter' => $chapter, 'anchor' => ['chapter' => $chapter, 'blockIndex' => $blockIndex, 'quote' => $quote]];
    }

    public function test_text_replaces_the_anchored_block_text_and_nothing_else(): void
    {
        $plan = $this->plan([F::suggestion('t1', 'text', self::anchor(1, F::C1_P1), 'Corrected placeholder paragraph.')]);
        self::assertSame(['t1'], $plan['applied']);
        self::assertSame([], $plan['stale']);
        self::assertSame([self::C1], array_keys($plan['changes']));
        $xp = $this->dom($plan['changes'][self::C1]);
        self::assertSame('Corrected placeholder paragraph.', $xp->evaluate('string(//h:p[1])'));
        self::assertSame('Second placeholder paragraph.', $xp->evaluate('string(//h:p[2])'));
        self::assertSame('Chapter one', $xp->evaluate('string(//h:h1)'));
    }

    public function test_a_block_whose_text_no_longer_starts_with_the_quote_is_stale(): void
    {
        $plan = $this->plan([F::suggestion('t1', 'text', self::anchor(1, 'Some text that is not in the chapter'), 'x')]);
        self::assertSame([], $plan['applied']);
        self::assertSame(['t1'], $plan['stale']);
        self::assertSame([], $plan['changes']);
    }

    public function test_a_moved_block_is_found_by_its_quote_when_only_one_block_matches(): void
    {
        $plan = $this->plan([F::suggestion('t1', 'text', self::anchor(9, F::C1_P2), ['text' => 'Moved placeholder.'])]);
        self::assertSame(['t1'], $plan['applied']);
        self::assertSame('Moved placeholder.', $this->dom($plan['changes'][self::C1])->evaluate('string(//h:p[2])'));
    }

    public function test_html_text_is_sanitised_and_written_as_xhtml_elements(): void
    {
        $html = 'Fixed <em>placeholder</em><script>alert(1)</script> <a href="javascript:alert(1)" onclick="x()">link</a><iframe src="https://x"></iframe>';
        $plan = $this->plan([F::suggestion('t1', 'text', self::anchor(2, F::C1_P2), ['html' => $html])]);
        $xhtml = $plan['changes'][self::C1];
        self::assertStringNotContainsString('script', $xhtml);
        self::assertStringNotContainsString('javascript', $xhtml);
        self::assertStringNotContainsString('onclick', $xhtml);
        self::assertStringNotContainsString('iframe', $xhtml);
        self::assertStringNotContainsString('xmlns=""', $xhtml, 'new elements are in the XHTML namespace');
        $xp = $this->dom($xhtml);
        self::assertSame('placeholder', $xp->evaluate('string(//h:p[2]/h:em)'));
        self::assertSame('Fixed placeholder link', $xp->evaluate('string(//h:p[2])'));
    }

    public function test_inserts_go_after_the_anchored_block_in_order(): void
    {
        $plan = $this->plan([
            F::suggestion('i1', 'insert', self::anchor(1, F::C1_P1), ['html' => '<p>Inserted one.</p>'], '2026-11-20T10:00:00.000Z'),
            F::suggestion('i2', 'insert', self::anchor(1, F::C1_P1), ['html' => '<p onmouseover="x()">Inserted two.</p>'], '2026-11-20T11:00:00.000Z'),
        ]);
        self::assertSame(['i1', 'i2'], $plan['applied']);
        $xhtml = $plan['changes'][self::C1];
        self::assertStringNotContainsString('onmouseover', $xhtml);
        $xp = $this->dom($xhtml);
        self::assertSame('Inserted one.', $xp->evaluate('string(//h:p[2])'));
        self::assertSame('Inserted two.', $xp->evaluate('string(//h:p[3])'));
        self::assertSame('Second placeholder paragraph.', $xp->evaluate('string(//h:p[4])'));
    }

    public function test_an_inserted_uploaded_image_is_copied_into_the_epub_with_a_manifest_item(): void
    {
        $name = $this->assets->store(F::PNG);
        $plan = $this->plan([F::suggestion('i1', 'insert', self::anchor(1, F::C1_P1), ['html' => "<p><img src=\"/api/suggestions/assets/{$name}\" alt=\"new\"/></p>"])]);
        self::assertSame(['i1'], $plan['applied']);
        $entry = 'OEBPS/Images/suggested-' . substr(hash('sha256', F::PNG), 0, 16) . '.png';
        self::assertSame(F::PNG, $plan['changes'][$entry]);
        $src = $this->dom($plan['changes'][self::C1])->evaluate('string(//h:p[2]/h:img/@src)');
        self::assertSame('../Images/' . basename($entry), $src);
        $opf = $plan['changes']['OEBPS/content.opf'];
        self::assertStringContainsString('href="Images/' . basename($entry) . '"', $opf);
        self::assertStringContainsString('media-type="image/png"', $opf);
    }

    public function test_image_points_the_matched_img_at_the_new_image(): void
    {
        $name = $this->assets->store(F::PNG);
        $plan = $this->plan([F::suggestion('m1', 'image', ['chapter' => 1, 'image' => '/api/library/books/5/images/Images/d1.png'], ['src' => "suggestions/assets/{$name}"])]);
        self::assertSame(['m1'], $plan['applied']);
        $src = $this->dom($plan['changes'][self::C1])->evaluate('string(//h:img/@src)');
        self::assertSame('../Images/suggested-' . substr(hash('sha256', F::PNG), 0, 16) . '.png', $src);
        self::assertArrayNotHasKey('OEBPS/Images/d1.png', $plan['changes'], 'the old image stays for other uses');
    }

    public function test_an_image_that_is_not_in_the_chapter_or_an_external_source_is_stale(): void
    {
        $plan = $this->plan([
            F::suggestion('m1', 'image', ['chapter' => 1, 'image' => 'Images/missing.png'], ['src' => 'data:image/png;base64,' . base64_encode(F::PNG)]),
            F::suggestion('m2', 'image', ['chapter' => 1, 'image' => '../Images/d1.png'], ['src' => 'https://example.com/x.png']),
        ]);
        self::assertSame([], $plan['applied']);
        self::assertSame(['m1', 'm2'], $plan['stale']);
    }

    public function test_diagram_fen_sets_data_fen_on_the_diagram_and_refuses_an_invalid_fen(): void
    {
        $fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
        $plan = $this->plan([
            F::suggestion('f1', 'diagram-fen', ['chapter' => 1, 'image' => '../Images/d1.png'], ['fen' => $fen]),
            F::suggestion('f2', 'diagram-fen', ['chapter' => 1, 'image' => '../Images/d1.png'], ['fen' => 'not a fen" onload="x']),
        ]);
        self::assertSame(['f1'], $plan['applied']);
        self::assertSame(['f2'], $plan['stale']);
        self::assertSame($fen, $this->dom($plan['changes'][self::C1])->evaluate('string(//h:img/@data-fen)'));
    }

    public function test_untouched_markup_keeps_its_void_and_empty_elements_html_safe(): void
    {
        $plan = $this->plan([F::suggestion('t1', 'text', self::anchor(1, F::C1_P1), 'x')]);
        $xhtml = $plan['changes'][self::C1];
        self::assertStringContainsString('<a id="anchor-x"></a>', $xhtml, 'an empty anchor is not self-closed (an HTML parser would open it)');
        self::assertMatchesRegularExpression('~<br\s*/>~', $xhtml);
        self::assertStringNotContainsString('</br>', $xhtml);
        self::assertStringNotContainsString('</img>', $xhtml);
    }

    public function test_kinds_that_are_not_epub_edits_are_neither_applied_nor_stale(): void
    {
        $plan = $this->plan([F::suggestion('c1', 'comment', ['chapter' => 1], 'x'), F::suggestion('g1', 'move', ['chapter' => 1], 'x')]);
        self::assertSame(['applied' => [], 'stale' => [], 'changes' => []], ['applied' => $plan['applied'], 'stale' => $plan['stale'], 'changes' => $plan['changes']]);
    }

    public function test_a_cover_of_the_same_type_replaces_the_declared_cover_bytes(): void
    {
        $name = $this->assets->store(F::JPG);
        $plan = $this->plan([F::suggestion('k1', 'cover', [], ['src' => "/api/suggestions/assets/{$name}"])]);
        self::assertSame(['k1'], $plan['applied']);
        self::assertSame(['OEBPS/Images/cover.jpg' => F::JPG], $plan['changes']);
    }

    public function test_a_cover_of_another_type_is_added_and_declared_as_the_cover(): void
    {
        $name = $this->assets->store(F::PNG);
        $plan = $this->plan([F::suggestion('k1', 'cover', [], ['src' => "/api/suggestions/assets/{$name}"])]);
        self::assertSame(['k1'], $plan['applied']);
        $entry = 'OEBPS/Images/suggested-' . substr(hash('sha256', F::PNG), 0, 16) . '.png';
        self::assertSame(F::PNG, $plan['changes'][$entry]);
        self::assertSame($entry, $this->packageAfter($plan)->coverPath());
        self::assertSame(1, substr_count($plan['changes']['OEBPS/content.opf'], 'cover-image'), 'only one item is the cover');
    }

    public function test_a_cover_picked_from_the_book_images_is_declared_without_new_bytes(): void
    {
        $plan = $this->plan([F::suggestion('k1', 'cover', [], ['epubPath' => 'OEBPS/Images/d1.png'])]);
        self::assertSame(['k1'], $plan['applied']);
        self::assertSame(['OEBPS/content.opf'], array_keys($plan['changes']));
        self::assertSame('OEBPS/Images/d1.png', $this->packageAfter($plan)->coverPath());
    }

    public function test_a_missing_cover_is_added_with_a_cover_meta(): void
    {
        $opf = \App\Tests\Fixtures\epub\EpubBuilder::opf(
            '<item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/><item id="img1" href="Images/d1.png" media-type="image/png"/>',
            '<itemref idref="c1"/>',
        );
        $name = $this->assets->store(F::JPG);
        $plan = $this->plan([F::suggestion('k1', 'cover', [], ['src' => "/api/suggestions/assets/{$name}"])], ['OEBPS/content.opf' => $opf]);
        self::assertSame(['k1'], $plan['applied']);
        self::assertArrayNotHasKey('OEBPS/Images/d1.png', $plan['changes'], 'the first image (the fallback cover) is never overwritten');
        self::assertStringContainsString('name="cover"', $plan['changes']['OEBPS/content.opf']);
        self::assertSame('OEBPS/Images/suggested-' . substr(hash('sha256', F::JPG), 0, 16) . '.jpg', $this->packageAfter($plan, ['OEBPS/content.opf' => $opf])->coverPath());
    }

    /** The package as it reads with the planned changes over the fixture. */
    private function packageAfter(array $plan, array $override = []): EpubPackage
    {
        $files = array_replace(F::files($override), $plan['changes']);
        $files['META-INF/container.xml'] = \App\Tests\Fixtures\epub\EpubBuilder::container();
        return new EpubPackage(static fn (string $p): ?string => $files[$p] ?? null);
    }
}

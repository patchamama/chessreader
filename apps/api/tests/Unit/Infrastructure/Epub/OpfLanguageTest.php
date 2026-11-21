<?php

declare(strict_types=1);

namespace App\Tests\Unit\Infrastructure\Epub;

use App\Infrastructure\Epub\OpfManifestParser;
use App\Tests\Fixtures\epub\EpubBuilder;
use PHPUnit\Framework\TestCase;

final class OpfLanguageTest extends TestCase
{
    public function test_dc_language_is_read(): void
    {
        $opf = EpubBuilder::opf('', '', '<dc:language>en-US</dc:language>');
        self::assertSame('en-US', (new OpfManifestParser())->parseXml($opf)['language']);
    }

    public function test_missing_dc_language_is_empty(): void
    {
        self::assertSame('', (new OpfManifestParser())->parseXml(EpubBuilder::opf('', ''))['language']);
    }
}

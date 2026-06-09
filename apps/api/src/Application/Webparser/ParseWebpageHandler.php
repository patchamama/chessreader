<?php

declare(strict_types=1);

namespace App\Application\Webparser;

use App\Application\Ingestion\Port\HtmlFetcher;
use App\Application\Recognition\RecognizeMovesCommand;
use App\Application\Recognition\RecognizeMovesHandler;
use App\Infrastructure\Web\ReadabilityExtractor;

final class ParseWebpageHandler
{
    public function __construct(
        private readonly HtmlFetcher          $fetcher,
        private readonly ReadabilityExtractor  $readability,
        private readonly RecognizeMovesHandler $recognizer,
    ) {
    }

    public function handle(ParseWebpageCommand $command): ParsedWebpage
    {
        // 1. Fetch raw HTML
        $rawHtml = $this->fetcher->fetch($command->url);

        // 2. Extract readable content
        $html = $this->readability->extract($rawHtml);

        // 3. Recognise chess games in the text (strip tags for recognition)
        $text = strip_tags($html);
        $games = $this->recognizer->handle(new RecognizeMovesCommand($text));

        // 4. Extract diagram <img> tags from readable HTML
        $images = $this->extractImages($html);

        return new ParsedWebpage($html, $games, $images);
    }

    /**
     * @return array<array{src:string,alt:string}>
     */
    private function extractImages(string $html): array
    {
        if (trim($html) === '') {
            return [];
        }

        $dom = new \DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_NOERROR | LIBXML_NOWARNING);

        $images = [];
        foreach ($dom->getElementsByTagName('img') as $img) {
            /** @var \DOMElement $img */
            $src = $img->getAttribute('src');
            $alt = $img->getAttribute('alt');
            if ($src !== '') {
                $images[] = ['src' => $src, 'alt' => $alt];
            }
        }

        return $images;
    }
}

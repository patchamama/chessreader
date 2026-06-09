<?php

declare(strict_types=1);

namespace App\Application\Webparser;

use App\Domain\Chess\RecognizedGame;

/**
 * Result DTO returned by ParseWebpageHandler.
 */
final class ParsedWebpage
{
    /**
     * @param string          $html   Readable HTML extracted from the URL.
     * @param RecognizedGame[] $games  Recognised game fragments (each has a GameTree).
     * @param array<array{src:string,alt:string}> $images Diagram <img> elements found in the extracted HTML.
     */
    public function __construct(
        public readonly string $html,
        public readonly array  $games,
        public readonly array  $images,
    ) {
    }

    public function toArray(): array
    {
        return [
            'html'   => $this->html,
            'games'  => array_map(fn($g) => $g->toArray(), $this->games),
            'images' => $this->images,
        ];
    }
}

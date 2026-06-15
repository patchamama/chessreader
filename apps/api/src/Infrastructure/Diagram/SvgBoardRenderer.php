<?php

declare(strict_types=1);

namespace App\Infrastructure\Diagram;

use App\Application\Diagram\DiagramRenderOptions;
use App\Application\Diagram\Port\DiagramRenderer;
use App\Domain\Chess\Fen;

/**
 * Renders an 8x8 chess board SVG from a FEN position.
 * Pieces are embedded inline as <symbol> elements so the whole output is self-contained.
 *
 * Board colors, piece set and coordinates are configurable via DiagramRenderOptions.
 */
final class SvgBoardRenderer implements DiagramRenderer
{
    private const SQUARE_SIZE = 45;
    private const BOARD_SIZE  = self::SQUARE_SIZE * 8;
    private const FOOTER_H    = 22;

    /** Default colors for light/dark squares (classic) */
    private const COLOR_LIGHT = '#f0d9b5';
    private const COLOR_DARK  = '#b58863';

    /** FEN piece char → symbol id suffix */
    private const PIECE_MAP = [
        'K' => 'wK', 'Q' => 'wQ', 'R' => 'wR', 'B' => 'wB', 'N' => 'wN', 'P' => 'wP',
        'k' => 'bK', 'q' => 'bQ', 'r' => 'bR', 'b' => 'bB', 'n' => 'bN', 'p' => 'bP',
    ];

    /** @var array<string,string> set name → directory of piece SVGs */
    private array $pieceSetDirs;

    /** @var array<string,array<string,string>> set name → (piece key → inner SVG), loaded lazily */
    private array $loadedSets = [];

    /**
     * @param string                $pieceDir     Default piece set directory (the fallback set).
     * @param array<string,string>  $pieceSetDirs Optional named set → directory map for selectable sets.
     */
    public function __construct(
        private readonly string $pieceDir,
        array $pieceSetDirs = [],
    ) {
        // The default directory is always available under the reserved key "".
        $this->pieceSetDirs = array_merge(['' => $pieceDir], $pieceSetDirs);
    }

    public function renderSvg(
        Fen $fen,
        ?string $footerText = null,
        bool $coordinates = false,
        ?DiagramRenderOptions $options = null,
    ): string {
        $options ??= DiagramRenderOptions::default();

        $light       = $options->lightColor ?? self::COLOR_LIGHT;
        $dark        = $options->darkColor ?? self::COLOR_DARK;
        $showCoords  = $coordinates || $options->coordinates;
        $pieceSvg    = $this->pieceSetFor($options->pieceSet);

        $hasFooter  = $footerText !== null && $footerText !== '';
        $coordExtra = $showCoords ? self::SQUARE_SIZE : 0;
        $totalH     = self::BOARD_SIZE + ($hasFooter ? self::FOOTER_H : 0) + $coordExtra;
        $totalW     = self::BOARD_SIZE + $coordExtra;

        $svg  = $this->openSvg($totalW, $totalH);
        $svg .= $this->renderSymbols($pieceSvg);
        $svg .= $this->renderSquares($coordExtra, $light, $dark);
        $svg .= $this->renderPieces($fen, $coordExtra);

        if ($showCoords) {
            $svg .= $this->renderCoordinates();
        }

        if ($hasFooter) {
            $svg .= $this->renderFooter($footerText, $totalW, self::BOARD_SIZE + $coordExtra);
        }

        $svg .= '</svg>';
        return $svg;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private function openSvg(int $w, int $h): string
    {
        return sprintf(
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            . 'width="%d" height="%d" viewBox="0 0 %d %d">',
            $w, $h, $w, $h,
        );
    }

    /** @param array<string,string> $pieceSvg */
    private function renderSymbols(array $pieceSvg): string
    {
        $out = '';
        foreach ($pieceSvg as $key => $inner) {
            $out .= sprintf(
                '<symbol id="piece-%s" viewBox="0 0 50 50">%s</symbol>',
                $key,
                $inner,
            );
        }
        return $out;
    }

    private function renderSquares(int $offset, string $light, string $dark): string
    {
        $out = '';
        for ($rank = 0; $rank < 8; $rank++) {
            for ($file = 0; $file < 8; $file++) {
                $isLight = ($rank + $file) % 2 === 0;
                $color   = $isLight ? $light : $dark;
                $x       = $offset + $file * self::SQUARE_SIZE;
                $y       = $offset + $rank * self::SQUARE_SIZE;
                $out    .= sprintf(
                    '<rect class="sq" x="%d" y="%d" width="%d" height="%d" fill="%s"/>',
                    $x, $y,
                    self::SQUARE_SIZE, self::SQUARE_SIZE,
                    $color,
                );
            }
        }
        return $out;
    }

    private function renderPieces(Fen $fen, int $offset): string
    {
        $rows = explode('/', explode(' ', $fen->value())[0]);
        $out  = '';

        foreach ($rows as $rankIdx => $row) {
            $fileIdx = 0;
            for ($i = 0; $i < strlen($row); $i++) {
                $ch = $row[$i];
                if (is_numeric($ch)) {
                    $fileIdx += (int) $ch;
                    continue;
                }
                if (!isset(self::PIECE_MAP[$ch])) {
                    $fileIdx++;
                    continue;
                }
                $pieceKey = self::PIECE_MAP[$ch];
                $x        = $offset + $fileIdx * self::SQUARE_SIZE;
                $y        = $offset + $rankIdx * self::SQUARE_SIZE;
                $out     .= sprintf(
                    '<use href="#piece-%s" x="%d" y="%d" width="%d" height="%d"/>',
                    $pieceKey, $x, $y,
                    self::SQUARE_SIZE, self::SQUARE_SIZE,
                );
                $fileIdx++;
            }
        }

        return $out;
    }

    private function renderCoordinates(): string
    {
        $s   = self::SQUARE_SIZE;
        $out = '';

        // File letters: a-h (bottom row, inside board area at offset row y=8*s)
        for ($f = 0; $f < 8; $f++) {
            $letter = chr(ord('a') + $f);
            $x      = $s + $f * $s + (int) ($s / 2) - 4;
            $y      = $s * 8 + 16;
            $out   .= sprintf(
                '<text x="%d" y="%d" font-size="12" font-family="sans-serif" fill="#333">%s</text>',
                $x, $y, $letter,
            );
        }

        // Rank numbers: 8-1 (left column)
        for ($r = 0; $r < 8; $r++) {
            $num = 8 - $r;
            $x   = 4;
            $y   = $s + $r * $s + (int) ($s / 2) + 4;
            $out .= sprintf(
                '<text x="%d" y="%d" font-size="12" font-family="sans-serif" fill="#333">%d</text>',
                $x, $y, $num,
            );
        }

        return $out;
    }

    private function renderFooter(string $text, int $width, int $yOffset): string
    {
        return sprintf(
            '<rect class="footer" x="0" y="%d" width="%d" height="%d" fill="#2c2c2c"/>'
            . '<text x="%d" y="%d" font-size="13" font-family="monospace" fill="#e8e8e8" text-anchor="middle">%s</text>',
            $yOffset, $width, self::FOOTER_H,
            (int) ($width / 2), $yOffset + 15,
            htmlspecialchars($text, ENT_XML1 | ENT_QUOTES, 'UTF-8'),
        );
    }

    /**
     * Resolve the piece SVG map for the requested set, falling back to the
     * default set when the name is unknown or its assets are missing.
     *
     * @return array<string,string>
     */
    private function pieceSetFor(?string $setName): array
    {
        $key = ($setName !== null && isset($this->pieceSetDirs[$setName])) ? $setName : '';
        return $this->loadPieceSet($key);
    }

    /** @return array<string,string> */
    private function loadPieceSet(string $key): array
    {
        if (isset($this->loadedSets[$key])) {
            return $this->loadedSets[$key];
        }

        $dir    = $this->pieceSetDirs[$key] ?? $this->pieceDir;
        $loaded = [];
        $missing = false;
        foreach (self::PIECE_MAP as $pieceKey) {
            $file = $dir . '/' . $pieceKey . '.svg';
            if (!file_exists($file)) {
                $loaded[$pieceKey] = '';
                $missing = true;
                continue;
            }
            $raw               = file_get_contents($file);
            $loaded[$pieceKey] = $this->extractSvgInner($raw, $pieceKey);
        }

        // If the named set is incomplete, fall back to the default set.
        if ($missing && $key !== '') {
            return $this->loadedSets[$key] = $this->loadPieceSet('');
        }

        return $this->loadedSets[$key] = $loaded;
    }

    /**
     * Strips the outer <svg> wrapper and scopes IDs to avoid conflicts when
     * multiple piece symbols are embedded in the same document.
     */
    private function extractSvgInner(string $svgContent, string $scope): string
    {
        // Remove XML declaration if present
        $svgContent = preg_replace('/<\?xml[^?]*\?>\s*/', '', $svgContent);
        // Extract content between first > and last </svg>
        $start = strpos($svgContent, '>');
        $end   = strrpos($svgContent, '</svg>');
        if ($start === false || $end === false) {
            return $svgContent;
        }
        $inner = substr($svgContent, $start + 1, $end - $start - 1);

        // Scope IDs: replace id="X" → id="piece-{scope}-X" and url(#X) → url(#piece-{scope}-X)
        $inner = preg_replace('/\bid="(\w+)"/', 'id="p-' . $scope . '-$1"', $inner);
        $inner = preg_replace('/url\(#(\w+)\)/', 'url(#p-' . $scope . '-$1)', $inner);
        $inner = preg_replace('/xlink:href="#(\w+)"/', 'xlink:href="#p-' . $scope . '-$1"', $inner);

        return $inner;
    }
}

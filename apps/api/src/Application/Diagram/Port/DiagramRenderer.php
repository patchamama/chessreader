<?php

declare(strict_types=1);

namespace App\Application\Diagram\Port;

use App\Application\Diagram\DiagramRenderOptions;
use App\Domain\Chess\Fen;

/**
 * Port: renders a chess board SVG from a FEN position.
 */
interface DiagramRenderer
{
    /**
     * Render an SVG string for the given FEN.
     *
     * @param  Fen                       $fen         Position to render.
     * @param  string|null               $footerText  Optional evaluation text to draw below the board.
     * @param  bool                      $coordinates Whether to draw file/rank coordinates.
     * @param  DiagramRenderOptions|null $options     Optional board theme / piece set / coordinate options.
     * @return string                    Complete SVG markup.
     */
    public function renderSvg(
        Fen $fen,
        ?string $footerText = null,
        bool $coordinates = false,
        ?DiagramRenderOptions $options = null,
    ): string;
}

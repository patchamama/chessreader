<?php

declare(strict_types=1);

namespace App\Application\Diagram;

use App\Application\Diagram\Command\RegenerateDiagramCommand;
use App\Application\Diagram\DiagramRenderOptions;
use App\Application\Diagram\Port\DiagramRenderer;
use App\Application\Diagram\Port\PngExporter;
use App\Application\Eval\Port\ChessEngine;
use App\Domain\Chess\Fen;
use App\Domain\Diagram\DiagramFooter;

/**
 * Regenerates a single chess diagram:
 * 1. Evaluate the FEN via ChessEngine
 * 2. Format the footer text
 * 3. Render SVG
 * 4. Optionally rasterize to PNG
 */
final class RegenerateDiagramHandler
{
    public function __construct(
        private readonly ChessEngine    $engine,
        private readonly DiagramRenderer $renderer,
        private readonly PngExporter    $exporter,
    ) {
    }

    /**
     * @return array{svg: string, footer: string, eval: array<string,mixed>, png?: string}
     */
    public function handle(RegenerateDiagramCommand $command): array
    {
        $fen     = Fen::fromString($command->fenValue);
        $eval    = $this->engine->evaluate($fen, $command->depth);
        $footer  = DiagramFooter::fromEvaluation($eval);
        $options = $command->options ?? DiagramRenderOptions::default();

        $svg = $this->renderer->renderSvg($fen, $footer->text(), $options->coordinates, $options);

        $result = [
            'svg'    => $svg,
            'footer' => $footer->text(),
            // Structured eval so the frontend can render the rich "SF18: (…) PV" footer.
            'eval'   => $eval->toArray(),
        ];

        if ($command->exportPng) {
            $result['png'] = $this->exporter->export($svg);
        }

        return $result;
    }
}

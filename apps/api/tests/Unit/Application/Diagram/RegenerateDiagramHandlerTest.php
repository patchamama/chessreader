<?php

declare(strict_types=1);

namespace App\Tests\Unit\Application\Diagram;

use App\Application\Diagram\Command\RegenerateDiagramCommand;
use App\Application\Diagram\DiagramRenderOptions;
use App\Application\Diagram\Port\DiagramRenderer;
use App\Application\Diagram\Port\PngExporter;
use App\Application\Diagram\RegenerateDiagramHandler;
use App\Application\Eval\Port\ChessEngine;
use App\Domain\Chess\Evaluation;
use App\Domain\Chess\Fen;
use PHPUnit\Framework\TestCase;

final class RegenerateDiagramHandlerTest extends TestCase
{
    public function test_returns_svg_with_eval_footer(): void
    {
        $engine = $this->createMock(ChessEngine::class);
        $engine->method('evaluate')->willReturn(
            Evaluation::fromCp(130, 'g1f3', 18)
        );

        $renderer = $this->createMock(DiagramRenderer::class);
        $renderer->expects($this->once())
            ->method('renderSvg')
            ->with(
                $this->isInstanceOf(Fen::class),
                $this->stringContains('+1.3'),
                $this->isType('bool'),
                $this->isInstanceOf(DiagramRenderOptions::class),
            )
            ->willReturn('<svg><text>+1.3 best: Nf3</text></svg>');

        $exporter = $this->createMock(PngExporter::class);
        $exporter->expects($this->never())->method('export');

        $handler = new RegenerateDiagramHandler($engine, $renderer, $exporter);
        $command = new RegenerateDiagramCommand(
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            null,
            18,
            false, // svg only
        );

        $result = $handler->handle($command);

        $this->assertArrayHasKey('svg', $result);
        $this->assertStringContainsString('+1.3', $result['svg']);
        $this->assertArrayHasKey('footer', $result);
        $this->assertStringContainsString('+1.3', $result['footer']);
    }

    public function test_returns_structured_eval(): void
    {
        $engine = $this->createMock(ChessEngine::class);
        $engine->method('evaluate')->willReturn(
            Evaluation::fromCp(130, 'g1f3', 18)
                ->withPv(['g1f3', 'b8c6'])
                ->withEngineName('Stockfish 18')
        );

        $renderer = $this->createMock(DiagramRenderer::class);
        $renderer->method('renderSvg')->willReturn('<svg/>');

        $exporter = $this->createMock(PngExporter::class);

        $handler = new RegenerateDiagramHandler($engine, $renderer, $exporter);
        $result  = $handler->handle(new RegenerateDiagramCommand(
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            null,
            18,
            false,
        ));

        $this->assertArrayHasKey('eval', $result);
        $this->assertSame(130, $result['eval']['scoreCp']);
        $this->assertSame(['g1f3', 'b8c6'], $result['eval']['pv']);
        $this->assertSame('Stockfish 18', $result['eval']['engineName']);
    }

    public function test_passes_render_options_through(): void
    {
        $engine = $this->createMock(ChessEngine::class);
        $engine->method('evaluate')->willReturn(Evaluation::fromCp(0, 'e2e4', 18));

        $options = new DiagramRenderOptions(lightColor: '#dee3e6', darkColor: '#5a80a7', pieceSet: 'fantasy', coordinates: true);

        $renderer = $this->createMock(DiagramRenderer::class);
        $renderer->expects($this->once())
            ->method('renderSvg')
            ->with(
                $this->isInstanceOf(Fen::class),
                $this->anything(),
                $this->isType('bool'),
                $this->identicalTo($options),
            )
            ->willReturn('<svg/>');

        $exporter = $this->createMock(PngExporter::class);

        $handler = new RegenerateDiagramHandler($engine, $renderer, $exporter);
        $handler->handle(new RegenerateDiagramCommand(
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            null,
            18,
            false,
            $options,
        ));
    }

    public function test_returns_png_bytes_when_requested(): void
    {
        $engine = $this->createMock(ChessEngine::class);
        $engine->method('evaluate')->willReturn(
            Evaluation::fromCp(0, 'e2e4', 18)
        );

        $renderer = $this->createMock(DiagramRenderer::class);
        $renderer->method('renderSvg')->willReturn('<svg/>');

        $exporter = $this->createMock(PngExporter::class);
        $exporter->expects($this->once())
            ->method('export')
            ->willReturn("\x89PNG\r\n\x1a\nFAKE");

        $handler = new RegenerateDiagramHandler($engine, $renderer, $exporter);
        $command = new RegenerateDiagramCommand(
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            null,
            18,
            true, // request PNG
        );

        $result = $handler->handle($command);
        $this->assertArrayHasKey('png', $result);
        $this->assertStringStartsWith("\x89PNG", $result['png']);
    }
}

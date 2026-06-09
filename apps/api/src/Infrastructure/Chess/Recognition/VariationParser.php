<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Recognition;

use App\Domain\Chess\GameNode;
use App\Domain\Chess\GameTree;
use PChess\Chess\Chess;

/**
 * Builds a GameTree from a token sequence using p-chess/chess for move validation.
 *
 * Variation handling mirrors the TypeScript implementation:
 * - '(' opens a variation: fork from position BEFORE the last mainline move
 * - ')' returns to state after last mainline move (tree pointer restores naturally)
 * - Nested variations are supported
 * - Illegal move -> node marked invalid, line stops
 */
final class VariationParser
{
    private static int $nodeCounter = 0;

    public static function resetCounter(): void
    {
        self::$nodeCounter = 0;
    }

    private static function nextId(): string
    {
        return 'node-' . (++self::$nodeCounter);
    }

    private const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    /**
     * @param SanToken[] $tokens
     */
    public function buildGameTree(array $tokens, string $startFen = self::START_FEN): GameTree
    {
        self::resetCounter();
        $tree = new GameTree($startFen);
        $chess = new Chess($startFen);

        $currentNodeId = null;
        $fenBeforeLastMove = $startFen;
        $parentBeforeLastMove = null;
        $dead = false;

        // Variation stack: each entry = ['fen' => string, 'returnToNodeId' => ?string, 'lineKeyDepth' => int]
        $variationStack = [];

        // Track line indices per stack depth key
        $lineKeyMap = [];

        // Variation line index tracking per parentId
        $variationLineIndex = [];

        $moveNumber = 1;
        $color = 'white';

        foreach ($tokens as $token) {
            if ($token->type === SanToken::TYPE_MOVE_NUMBER) {
                if (empty($variationStack)) {
                    $moveNumber = $token->moveNumber ?? 1;
                    $color = $token->isEllipsis ? 'black' : 'white';
                }
                continue;
            }

            if ($token->type === SanToken::TYPE_VARIATION_OPEN) {
                // Save current state (after last mainline move) for restore on ')'
                $currentFen = $chess->fen();
                $depth = count($variationStack) + 1;
                $variationStack[] = [
                    'fen'            => $currentFen,
                    'returnToNodeId' => $currentNodeId,
                    'lineKeyDepth'   => $depth,
                ];
                // Fork from position BEFORE last mainline move (new Chess instance)
                $chess = new Chess($fenBeforeLastMove);
                $currentNodeId = $parentBeforeLastMove;
                $dead = false;
                continue;
            }

            if ($token->type === SanToken::TYPE_VARIATION_CLOSE) {
                if (!empty($variationStack)) {
                    $saved = array_pop($variationStack);
                    $chess = new Chess($saved['fen']);
                    $currentNodeId = $saved['returnToNodeId'];
                    $dead = false;
                }
                continue;
            }

            if ($token->type !== SanToken::TYPE_MOVE) {
                continue;
            }

            if ($dead) {
                continue;
            }

            $san = $token->san ?? '';
            $parentId = $currentNodeId;
            $fenBeforeMove = $chess->fen();

            $moveResult = null;
            $isInvalid = false;

            $moveResult = $chess->move($san);
            if ($moveResult === null) {
                $isInvalid = true;
            }

            $nodeId = self::nextId();
            $node = new GameNode(
                id: $nodeId,
                san: $san,
                fen: $isInvalid ? $fenBeforeMove : $chess->fen(),
                from: $moveResult?->from ?? '',
                to: $moveResult?->to ?? '',
                moveNumber: $token->moveNumber ?? $moveNumber,
                color: $token->color ?? $color,
                parentId: $parentId,
                invalid: $isInvalid,
            );

            if (empty($variationStack)) {
                // Mainline
                $tree->addMainlineNode($node);
            } else {
                // Variation
                $stackTop = $variationStack[count($variationStack) - 1];
                $variationParentId = $stackTop['returnToNodeId'] ?? 'root';
                $lineKey = '__depth_' . $stackTop['lineKeyDepth'] . '__';

                if (!isset($lineKeyMap[$lineKey])) {
                    $parentKey = $variationParentId;
                    $lineKeyMap[$lineKey] = $variationLineIndex[$parentKey] ?? 0;
                    $variationLineIndex[$parentKey] = $lineKeyMap[$lineKey] + 1;
                }

                $lineIndex = $lineKeyMap[$lineKey];
                $tree->addVariationNode($node, $variationParentId, $lineIndex);
            }

            $currentNodeId = $nodeId;
            $fenBeforeLastMove = $fenBeforeMove;
            $parentBeforeLastMove = $parentId;

            if ($isInvalid) {
                $dead = true;
            } else {
                if (($token->color ?? $color) === 'black') {
                    $moveNumber = ($token->moveNumber ?? $moveNumber) + 1;
                    $color = 'white';
                } else {
                    $color = 'black';
                }
            }
        }

        return $tree;
    }
}

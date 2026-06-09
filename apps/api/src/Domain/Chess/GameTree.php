<?php

declare(strict_types=1);

namespace App\Domain\Chess;

/**
 * The GameTree holds the full tree of moves: mainline + variations.
 *
 * Variations are keyed by the parent node id.
 * Each entry is an array of lines (each line is an array of GameNode).
 */
final class GameTree
{
    /** @var array<string, GameNode> */
    private array $nodes = [];

    /** @var string[] mainline node ids in order */
    private array $mainline = [];

    /** @var array<string, array<array<string>>> variations: parentId -> list of lines (each line = list of node ids) */
    private array $variations = [];

    public function __construct(
        public readonly string $startFen,
    ) {
    }

    public function addMainlineNode(GameNode $node): void
    {
        $this->nodes[$node->id] = $node;
        $this->mainline[] = $node->id;
    }

    public function addVariationNode(GameNode $node, string $variationParentId, int $lineIndex): void
    {
        $this->nodes[$node->id] = $node;
        if (!isset($this->variations[$variationParentId])) {
            $this->variations[$variationParentId] = [];
        }
        while (count($this->variations[$variationParentId]) <= $lineIndex) {
            $this->variations[$variationParentId][] = [];
        }
        $this->variations[$variationParentId][$lineIndex][] = $node->id;
    }

    public function getNode(string $id): ?GameNode
    {
        return $this->nodes[$id] ?? null;
    }

    /** @return GameNode[] */
    public function mainlineNodes(): array
    {
        return array_map(fn(string $id) => $this->nodes[$id], $this->mainline);
    }

    /** @return string[] */
    public function getMainline(): array
    {
        return $this->mainline;
    }

    /** @return array<string, GameNode> */
    public function getNodes(): array
    {
        return $this->nodes;
    }

    /** @return array<string, array<array<string>>> */
    public function getVariations(): array
    {
        return $this->variations;
    }

    /**
     * Returns the path from root to a given node (ordered list of GameNode).
     * @return GameNode[]
     */
    public function pathToNode(string $nodeId): array
    {
        $path = [];
        $current = $this->nodes[$nodeId] ?? null;
        while ($current !== null) {
            array_unshift($path, $current);
            $current = $current->parentId !== null ? ($this->nodes[$current->parentId] ?? null) : null;
        }
        return $path;
    }

    public function toArray(): array
    {
        return [
            'startFen'   => $this->startFen,
            'nodes'      => array_map(fn(GameNode $n) => $n->toArray(), $this->nodes),
            'mainline'   => $this->mainline,
            'variations' => $this->variations,
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Chess;

/**
 * Value object for a chess position evaluation from an engine.
 */
final class Evaluation
{
    /**
     * @param string[]|null $pv Principal variation as a list of UCI moves.
     */
    private function __construct(
        public readonly ?int $scoreCp,
        public readonly ?int $mate,
        public readonly ?string $bestMove,
        public readonly int $depth,
        public readonly ?array $pv = null,
        public readonly ?string $engineName = null,
    ) {
    }

    public static function fromCp(int $scoreCp, ?string $bestMove, int $depth): self
    {
        return new self($scoreCp, null, $bestMove, $depth);
    }

    public static function fromMate(int $mate, ?string $bestMove, int $depth): self
    {
        return new self(null, $mate, $bestMove, $depth);
    }

    /** @param string[] $pv */
    public function withPv(array $pv): self
    {
        return new self($this->scoreCp, $this->mate, $this->bestMove, $this->depth, $pv, $this->engineName);
    }

    public function withEngineName(string $engineName): self
    {
        return new self($this->scoreCp, $this->mate, $this->bestMove, $this->depth, $this->pv, $engineName);
    }

    public function isMate(): bool
    {
        return $this->mate !== null;
    }

    public function toArray(): array
    {
        $result = ['depth' => $this->depth];
        if ($this->mate !== null) {
            $result['mate'] = $this->mate;
        } else {
            $result['scoreCp'] = $this->scoreCp;
        }
        if ($this->bestMove !== null) {
            $result['bestMove'] = $this->bestMove;
        }
        if ($this->pv !== null) {
            $result['pv'] = $this->pv;
        }
        if ($this->engineName !== null) {
            $result['engineName'] = $this->engineName;
        }
        return $result;
    }
}

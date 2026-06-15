<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Engine;

use App\Domain\Chess\Evaluation;

/**
 * Parses raw UCI output lines into an Evaluation value object.
 * Pure function — no process, no binary needed. Fully unit-testable.
 */
final class UciParser
{
    /**
     * @param string[] $lines UCI output lines (info … + bestmove …)
     */
    public function parse(array $lines): Evaluation
    {
        if (empty($lines)) {
            throw new \RuntimeException('UCI parser received empty output.');
        }

        $lastInfoLine = null;
        $bestMove     = null;
        $engineName   = null;

        foreach ($lines as $line) {
            $line = trim($line);
            if (str_starts_with($line, 'id name ')) {
                $engineName = trim(substr($line, strlen('id name ')));
            } elseif (str_starts_with($line, 'info ') && str_contains($line, 'score')) {
                $lastInfoLine = $line;
            } elseif (str_starts_with($line, 'bestmove ')) {
                $parts    = explode(' ', $line);
                $bestMove = $parts[1] ?? null;
                if ($bestMove === '(none)') {
                    $bestMove = null;
                }
            }
        }

        if ($lastInfoLine === null) {
            // Some positions (trivial mates) produce only a bestmove line without an info score.
            // Parse those as a zero-depth cp=0 result.
            if ($bestMove !== null) {
                return $this->decorate(Evaluation::fromCp(0, $bestMove, 0), null, $engineName);
            }
            throw new \RuntimeException('No info line with score found in UCI output.');
        }

        $depth = $this->extractInt($lastInfoLine, 'depth') ?? 0;
        $pv    = $this->extractPv($lastInfoLine);

        // score cp N  |  score mate N
        if (preg_match('/\bscore mate (-?\d+)/', $lastInfoLine, $m)) {
            return $this->decorate(Evaluation::fromMate((int) $m[1], $bestMove, $depth), $pv, $engineName);
        }

        if (preg_match('/\bscore cp (-?\d+)/', $lastInfoLine, $m)) {
            return $this->decorate(Evaluation::fromCp((int) $m[1], $bestMove, $depth), $pv, $engineName);
        }

        throw new \RuntimeException('Unable to parse score from UCI info line: ' . $lastInfoLine);
    }

    /** @param string[]|null $pv */
    private function decorate(Evaluation $eval, ?array $pv, ?string $engineName): Evaluation
    {
        if ($pv !== null) {
            $eval = $eval->withPv($pv);
        }
        if ($engineName !== null) {
            $eval = $eval->withEngineName($engineName);
        }
        return $eval;
    }

    /**
     * The `pv` token is the last in a UCI info line — everything after it is the move list.
     *
     * @return string[]|null
     */
    private function extractPv(string $line): ?array
    {
        if (!preg_match('/\bpv\s+(.+)$/', $line, $m)) {
            return null;
        }
        $moves = preg_split('/\s+/', trim($m[1])) ?: [];
        return $moves === [] ? null : $moves;
    }

    private function extractInt(string $line, string $token): ?int
    {
        if (preg_match('/\b' . preg_quote($token, '/') . '\s+(-?\d+)/', $line, $m)) {
            return (int) $m[1];
        }
        return null;
    }
}

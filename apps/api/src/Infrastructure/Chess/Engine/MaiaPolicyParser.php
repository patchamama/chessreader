<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Engine;

/** Reads lc0's verbose move statistics: the policy (P) of each move is how likely a player of the net's level plays it. */
final class MaiaPolicyParser
{
    /**
     * @param string[] $lines
     * @return list<array{uci: string, probability: float}>
     */
    public static function parse(array $lines, int $limit): array
    {
        $moves = [];
        foreach ($lines as $line) {
            if (preg_match('/^info string ([a-h][1-8][a-h][1-8][qrbn]?)\s.*\(P:\s*([\d.]+)%\)/', trim($line), $m)) {
                $moves[] = ['uci' => $m[1], 'probability' => round(((float) $m[2]) / 100, 4)];
            }
        }
        usort($moves, fn(array $a, array $b) => $b['probability'] <=> $a['probability']);
        return array_slice($moves, 0, $limit);
    }
}

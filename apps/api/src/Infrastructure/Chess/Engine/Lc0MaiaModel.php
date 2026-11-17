<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Engine;

use App\Application\Engine\Port\HumanMoveModel;
use App\Domain\Chess\Fen;

/** Maia through lc0: one node of search, the net's policy is the prediction. */
final class Lc0MaiaModel implements HumanMoveModel
{
    public function __construct(private readonly ?string $lc0, private readonly MaiaWeights $weights)
    {
    }

    public function ratings(): array
    {
        return $this->lc0 === null ? [] : $this->weights->ratings();
    }

    public function predict(Fen $fen, int $rating, int $limit): array
    {
        $net = $this->weights->closest($rating);
        if ($this->lc0 === null || $net === null) {
            throw new \RuntimeException('Maia is not installed on this server.');
        }
        $cmd = [$this->lc0, '--weights=' . $this->weights->file($net), '--verbose-move-stats'];
        $proc = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
        if (!is_resource($proc)) {
            throw new \RuntimeException('Could not start lc0.');
        }
        fwrite($pipes[0], "uci\nisready\nposition fen {$fen->value()}\ngo nodes 1\n");
        fflush($pipes[0]);
        $lines = [];
        $deadline = microtime(true) + 20;
        stream_set_blocking($pipes[1], false);
        while (microtime(true) < $deadline) {
            $line = fgets($pipes[1]);
            if ($line === false) {
                usleep(10000);
                continue;
            }
            $lines[] = rtrim($line);
            if (str_starts_with($line, 'bestmove')) {
                break;
            }
        }
        fwrite($pipes[0], "quit\n");
        fclose($pipes[0]);
        fclose($pipes[1]);
        proc_close($proc);
        return ['rating' => $net, 'moves' => MaiaPolicyParser::parse($lines, $limit)];
    }
}

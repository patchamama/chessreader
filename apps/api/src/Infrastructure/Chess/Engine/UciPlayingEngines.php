<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Engine;

use App\Application\Engine\Port\PlayingEngines;
use App\Domain\Chess\Fen;

/**
 * The UCI engines found on the server: Stockfish (the version chosen by the
 * admin), each Maia net through lc0 (plays like a person of that rating), and
 * GNU Chess. Each move starts the engine, sends the position and reads the move.
 */
final class UciPlayingEngines implements PlayingEngines
{
    /** @param array<string, string|null> $binaries id => binary path (null: not installed) */
    public function __construct(private readonly array $binaries, private readonly MaiaWeights $maia)
    {
    }

    public function list(): array
    {
        $out = [];
        if ($this->binaries['stockfish'] ?? null) {
            $out[] = ['id' => 'stockfish', 'name' => 'Stockfish', 'style' => 'The strongest engine; level sets its depth and skill.'];
        }
        if ($this->binaries['lc0'] ?? null) {
            foreach ($this->maia->ratings() as $r) {
                $out[] = ['id' => "maia-{$r}", 'name' => "Maia {$r}", 'style' => "Plays like a human of about {$r} (neural net trained on Lichess games)."];
            }
        }
        if ($this->binaries['gnuchess'] ?? null) {
            $out[] = ['id' => 'gnuchess', 'name' => 'GNU Chess', 'style' => 'A classic engine with its own style; level sets its thinking time.'];
        }
        return $out;
    }

    public function move(string $engineId, Fen $fen, int $level): ?string
    {
        $level = max(1, min(8, $level));
        if (str_starts_with($engineId, 'maia-')) {
            $rating = (int) substr($engineId, 5);
            if (!($this->binaries['lc0'] ?? null) || !in_array($rating, $this->maia->ratings(), true)) {
                return null;
            }
            return $this->ask([$this->binaries['lc0'], '--weights=' . $this->maia->file($rating)], [], $fen, 'go nodes 1');
        }
        if ($engineId === 'stockfish' && ($this->binaries['stockfish'] ?? null)) {
            return $this->ask([$this->binaries['stockfish']], ['setoption name Skill Level value ' . min(20, ($level - 1) * 3)], $fen, 'go depth ' . (2 + $level * 2));
        }
        if ($engineId === 'gnuchess' && ($this->binaries['gnuchess'] ?? null)) {
            return $this->ask([$this->binaries['gnuchess'], '--uci'], [], $fen, 'go movetime ' . (100 * $level));
        }
        return null;
    }

    /** @param list<string> $cmd @param list<string> $setup */
    private function ask(array $cmd, array $setup, Fen $fen, string $go): ?string
    {
        $proc = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
        if (!is_resource($proc)) {
            return null;
        }
        fwrite($pipes[0], implode("\n", ['uci', ...$setup, 'isready', 'position fen ' . $fen->value(), $go]) . "\n");
        fflush($pipes[0]);
        stream_set_blocking($pipes[1], false);
        $move = null;
        $deadline = microtime(true) + 15;
        while (microtime(true) < $deadline) {
            $line = fgets($pipes[1]);
            if ($line === false) {
                usleep(10000);
                continue;
            }
            if (preg_match('/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/', $line, $m)) {
                $move = $m[1];
                break;
            }
        }
        @fwrite($pipes[0], "quit\n");
        fclose($pipes[0]);
        fclose($pipes[1]);
        // Always: a slow engine must not hold the request after its deadline.
        proc_terminate($proc, 9);
        proc_close($proc);
        return $move;
    }
}

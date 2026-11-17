<?php

declare(strict_types=1);

namespace App\Infrastructure\Chess\Engine;

/** The Maia nets on this server: storage/maia/maia-<rating>.pb.gz (downloaded by the admin, not shipped). */
final class MaiaWeights
{
    public function __construct(private readonly string $dir)
    {
    }

    /** @return list<int> */
    public function ratings(): array
    {
        $out = [];
        foreach (glob(rtrim($this->dir, '/') . '/maia-*.pb.gz') ?: [] as $f) {
            if (preg_match('/maia-(\d{4})\.pb\.gz$/', $f, $m)) {
                $out[] = (int) $m[1];
            }
        }
        sort($out);
        return $out;
    }

    public function closest(int $rating): ?int
    {
        $best = null;
        foreach ($this->ratings() as $r) {
            if ($best === null || abs($r - $rating) < abs($best - $rating)) {
                $best = $r;
            }
        }
        return $best;
    }

    public function file(int $rating): string
    {
        return rtrim($this->dir, '/') . "/maia-{$rating}.pb.gz";
    }
}
